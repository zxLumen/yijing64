import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { fetchModels, streamChat } from './lib/llm.js'
import { clearRecords, deleteRecord, listRecords, listVisitors, saveRecord } from './lib/records.js'
import { publicState, readKeys, resolveConfig, saveKey, saveSettings } from './lib/settings.js'
import { cookieValue, ownerToken, resolveScope } from './lib/scope.js'
import { ensureDir } from './lib/store.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(HERE, process.env.YIJING_DIST || 'dist')
const PORT = Number(process.env.YIJING_PORT || process.env.PORT || 8788)
const HOST = process.env.YIJING_HOST || '0.0.0.0'
const DATA_DIR = path.resolve(process.env.YIJING_DATA_DIR || path.join(HERE, 'data'))
const SESSION_SECRET = process.env.SESSION_SECRET || undefined

const BODY_LIMIT = 256 * 1024
const RATE = { limit: 10, windowMs: 60_000 }
const MAX_MESSAGES = 24
const MAX_MESSAGE_CHARS = 20_000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

/** @param {import('node:http').ServerResponse} res @param {unknown} body @param {number} status */
const sendJSON = (res, body, status = 200) => {
  const text = JSON.stringify(body ?? {})
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(text)
}

/** @param {import('node:http').ServerResponse} res */
const fail = (res, status, message) => sendJSON(res, { error: message }, status)

/** @param {import('node:http').IncomingMessage} req */
const readBody = (req) =>
  new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    let over = false
    const tooLarge = () => httpError(413, '请求体过大（上限 256KB）。')
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        // 超出上限后不再缓冲，但要读完剩余请求体，否则客户端只会看到连接重置而非 413
        over = true
        chunks.length = 0
        if (size > BODY_LIMIT * 8) {
          reject(tooLarge())
          req.destroy()
        }
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (over) reject(tooLarge())
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', () => reject(httpError(400, '请求读取失败。')))
  })

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<any>}
 */
const readJSONBody = async (req) => {
  const raw = await readBody(req)
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw httpError(400, '请求体不是合法 JSON。')
  }
}

/**
 * @param {number} status
 * @param {string} message
 */
const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status })

/** 简单滑动窗口限流：防止有人狂刷站长的 Key。 @param {string} key */
const rateLimited = (key) => {
  const now = Date.now()
  /** @type {number[]} */
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE.windowMs)
  recent.push(now)
  if (hits.size > 4096) hits.clear()
  hits.set(key, recent)
  return recent.length > RATE.limit
}

/** @type {Map<string, number[]>} */
const hits = new Map()

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
const sendFile = async (req, res, filePath, cacheControl) => {
  const stat = await fsp.stat(filePath).catch(() => null)
  if (!stat?.isFile()) return false
  const type = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, headers)
    res.end()
    return true
  }
  res.writeHead(200, headers)
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('end', resolve)
    stream.pipe(res)
  })
  return true
}

/**
 * 静态资源 + SPA 回退。index.html 不缓存，带 hash 的 assets 长缓存。
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
const serveStatic = async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  const target = path.resolve(DIST, rel)
  // 目录穿越防护
  if (target !== DIST && !target.startsWith(DIST + path.sep)) return false

  let filePath = target
  const stat = await fsp.stat(filePath).catch(() => null)
  if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html')
  if (stat?.isFile()) {
    const immutable = rel.startsWith('assets/')
    return sendFile(req, res, filePath, immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
  }
  if (rel === '' || !path.extname(rel)) {
    return sendFile(req, res, path.join(DIST, 'index.html'), 'no-cache')
  }
  return false
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = url.pathname

  try {
    // 兜底登录 / 切换数据域：把 ?owner=、?view= 换成 cookie 后重定向（抹掉 query 里的敏感值）
    const ownerParam = url.searchParams.get('owner')
    const viewParam = url.searchParams.get('view')
    if (ownerParam !== null || viewParam !== null) {
      /** @type {string[]} */
      const cookies = []
      if (ownerParam !== null) {
        const token = await ownerToken(DATA_DIR)
        if (ownerParam !== token) return fail(res, 403, 'owner token 不对')
        cookies.push(cookieValue('yijing_owner', ownerParam))
      }
      if (viewParam !== null) cookies.push(cookieValue('yijing_view', viewParam))
      url.searchParams.delete('owner')
      url.searchParams.delete('view')
      const query = url.searchParams.toString()
      res.writeHead(302, {
        Location: `${pathname}${query ? `?${query}` : ''}`,
        'Set-Cookie': cookies,
        'Cache-Control': 'no-store',
      })
      res.end()
      return
    }

    if (!pathname.startsWith('/api/')) {
      if (await serveStatic(req, res)) return
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('404')
      return
    }
    await handleAPI(req, res, url)
  } catch (err) {
    const status = /** @type {any} */ (err)?.statusCode ?? 500
    console.error(`[yijing] ${req.method} ${pathname} -> ${status}`, err)
    if (res.headersSent) {
      res.end()
      return
    }
    fail(res, status, err instanceof Error ? err.message : '服务器内部错误。')
  }
})

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 */
const handleAPI = async (req, res, url) => {
  const pathname = url.pathname
  const scope = await resolveScope(req, { dataDir: DATA_DIR, sessionSecret: SESSION_SECRET })
  const applyCookies = () => {
    if (scope.setCookies.length) res.setHeader('Set-Cookie', scope.setCookies)
  }
  // 站长切到访客数据域时只读：不可写、不可删
  const viewingReadOnly = () => !!(scope.owner && scope.viewing)

  if (pathname === '/api/health' && req.method === 'GET') {
    applyCookies()
    return sendJSON(res, { ok: true, owner: scope.owner, build: 'yijing64-web' })
  }

  if (pathname === '/api/session' && req.method === 'GET') {
    applyCookies()
    const config = await resolveConfig(DATA_DIR)
    return sendJSON(res, {
      owner: scope.owner,
      viewing: scope.viewing,
      cid: scope.cid,
      visitorAi: config.visitorAi,
      hasAi: !!config.apiKey,
      provider: config.provider,
      model: config.model,
    })
  }

  // ---- 起卦记录（按数据域隔离；站长查看访客数据时只读） ----
  if (pathname === '/api/records') {
    applyCookies()
    if (req.method === 'GET') {
      return sendJSON(res, { records: await listRecords(DATA_DIR, scope.scopeKey) })
    }
    if (req.method === 'POST') {
      if (viewingReadOnly()) return fail(res, 403, '查看访客数据时不可写入。')
      const body = await readJSONBody(req)
      return sendJSON(res, { record: await saveRecord(DATA_DIR, scope.scopeKey, body.record ?? body) })
    }
    if (req.method === 'DELETE') {
      if (viewingReadOnly()) return fail(res, 403, '查看访客数据时不可删除。')
      const body = await readJSONBody(req)
      if (body.all === true) {
        await clearRecords(DATA_DIR, scope.scopeKey)
        return sendJSON(res, { ok: true, cleared: 'all' })
      }
      const id = typeof body.id === 'string' ? body.id : url.searchParams.get('id')
      if (!id) return fail(res, 400, '缺少记录 id。')
      await deleteRecord(DATA_DIR, scope.scopeKey, id)
      return sendJSON(res, { ok: true, deleted: id })
    }
    return fail(res, 405, '方法不允许。')
  }

  // ---- 站长：访客清单（只读） ----
  if (pathname === '/api/visitors' && req.method === 'GET') {
    applyCookies()
    if (!scope.owner) return fail(res, 403, '仅站长可查看。')
    return sendJSON(res, { visitors: await listVisitors(DATA_DIR) })
  }

  // ---- 站长：AI 配置 ----
  if (pathname === '/api/chat/state' && req.method === 'GET') {
    applyCookies()
    return sendJSON(res, await publicState(DATA_DIR))
  }

  if (pathname === '/api/chat/config' && req.method === 'POST') {
    applyCookies()
    if (!scope.owner) return fail(res, 403, '仅站长可修改 AI 配置。')
    await saveSettings(DATA_DIR, await readJSONBody(req))
    // 与 /api/chat/key、/api/chat/state 一致：回传公开快照（含槽位数组与 Key 掩码），前端可直接替换状态
    return sendJSON(res, await publicState(DATA_DIR))
  }

  if (pathname === '/api/chat/key' && req.method === 'POST') {
    applyCookies()
    if (!scope.owner) return fail(res, 403, '仅站长可修改 API Key。')
    const body = await readJSONBody(req)
    const provider = typeof body.provider === 'string' ? body.provider : ''
    if (!provider) return fail(res, 400, '缺少 provider。')
    await saveKey(DATA_DIR, provider, typeof body.apiKey === 'string' ? body.apiKey : '')
    return sendJSON(res, await publicState(DATA_DIR))
  }

  if (pathname === '/api/chat/models' && req.method === 'POST') {
    applyCookies()
    if (!scope.owner) return fail(res, 403, '仅站长可拉取模型列表。')
    const body = await readJSONBody(req)
    const config = await resolveConfig(DATA_DIR)
    const provider = typeof body.provider === 'string' ? body.provider : config.provider
    const slot = (await publicState(DATA_DIR)).providers.find((p) => p.id === provider)
    // 用「所选 provider 自己的」Base URL 与 Key，而不是当前生效的那一套
    const apiKey = (await readKeys(DATA_DIR))[provider] ?? ''
    const models = await fetchModels({ baseURL: slot?.baseURL || config.baseURL, apiKey }, scope.scopeKey)
    return sendJSON(res, { models })
  }

  // ---- AI 解读（SSE：正文 + 思考双通道） ----
  if (pathname === '/api/interpret' && req.method === 'POST') {
    applyCookies()
    const config = await resolveConfig(DATA_DIR)
    if (!scope.owner && !config.visitorAi) return fail(res, 403, '站长暂未开放访客使用 AI。')
    if (!config.apiKey) return fail(res, 503, '站长尚未配置 API Key。')
    if (rateLimited(`interpret:${scope.scopeKey}`)) return fail(res, 429, '请求太频繁，请稍后再试。')

    const body = await readJSONBody(req)
    const messages = sanitizeMessages(body.messages)
    if (!messages.length) return fail(res, 400, '缺少对话内容。')

    const controller = new AbortController()
    req.on('close', () => controller.abort())

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    /** @param {unknown} obj */
    const send = (obj) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    try {
      const result = await streamChat({
        config,
        messages,
        thinking: body.thinking === true,
        sessionId: scope.scopeKey,
        signal: controller.signal,
        onDelta: (delta) => send({ delta }),
      })
      send({ done: true, text: result.text, reasoning: result.reasoning, usage: result.usage })
    } catch (err) {
      send({ error: { message: err instanceof Error ? err.message : 'AI 请求失败。' } })
    } finally {
      res.end()
    }
    return
  }

  return fail(res, 404, '接口不存在。')
}

/**
 * 只接受 system/user/assistant 三种角色，逐条限长。
 * @param {any} input
 */
const sanitizeMessages = (input) => {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, MAX_MESSAGES)
    .flatMap((item) => {
      const role = item?.role === 'system' || item?.role === 'assistant' ? item.role : item?.role === 'user' ? 'user' : null
      if (!role) return []
      const content = typeof item?.content === 'string' ? item.content.slice(0, MAX_MESSAGE_CHARS) : ''
      return content.trim() ? [{ role, content }] : []
    })
}

await ensureDir(DATA_DIR)
const token = await ownerToken(DATA_DIR)

server.listen(PORT, HOST, () => {
  const scopeHint = SESSION_SECRET ? '已启用博客登录态 SSO' : '未配置 SESSION_SECRET，仅可用 owner token'
  console.log(`yijing64-web listening on http://${HOST}:${PORT}  data=${DATA_DIR}  ${scopeHint}`)
  if (scopeHint.startsWith('未配置')) {
    console.log(`owner 调试链接：/?owner=${token}`)
  }
})

export { server }
