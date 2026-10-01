import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OWNER_TOKEN = 'test-owner-token-0123456789'

/** @type {http.Server} */
let upstream
let child
let base = ''
let dataDir = ''
let distDir = ''

/** 记录收到的上游请求体，便于断言转发形状。 */
let lastUpstreamBody = null
/** 记录拉取模型列表时上游收到的 Authorization（Bearer <key>）。 */
const seenAuth = []
/** 测试上游地址（before 里赋值）。 */
let upstreamBase = ''

const startUpstream = async () => {
  upstream = http.createServer(async (req, res) => {
    /** @type {Buffer[]} */
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf8')

    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      seenAuth.push(req.headers.authorization ?? '')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'mock-reasoner' }, { id: 'mock-plain' }] }))
      return
    }

    lastUpstreamBody = raw ? JSON.parse(raw) : null
    const thinking = lastUpstreamBody?.thinking?.type === 'enabled'
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)
    if (thinking) send({ choices: [{ delta: { reasoning_content: '先辨体用' } }] })
    send({ choices: [{ delta: { content: '得乾之坤。' } }] })
    send({
      usage: {
        prompt_tokens: 120,
        completion_tokens: 30,
        total_tokens: 150,
        prompt_cache_hit_tokens: 20,
        prompt_cache_miss_tokens: 100,
      },
    })
    res.write('data: [DONE]\n\n')
    res.end()
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  return /** @type {any} */ (upstream.address()).port
}

/** 占一个端口再放开，用来给子进程分配。 */
const freePort = async () => {
  const probe = http.createServer()
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const port = /** @type {any} */ (probe.address()).port
  await new Promise((resolve) => probe.close(resolve))
  return port
}

const waitForHealth = async () => {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`)
      if (res.ok) return
    } catch {
      /* 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('服务端未在 10 秒内就绪')
}

/** 带 cookie 罐的极简客户端。 */
const makeClient = () => {
  /** @type {Map<string, string>} */
  const jar = new Map()
  const request = async (pathname, options = {}) => {
    const headers = new Headers(options.headers)
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await fetch(base + pathname, { ...options, headers, redirect: 'manual' })
    for (const raw of res.headers.getSetCookie()) {
      const pair = raw.split(';')[0]
      const idx = pair.indexOf('=')
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      if (!value || /Max-Age=0/.test(raw)) jar.delete(name)
      else jar.set(name, value)
    }
    return res
  }
  const json = async (pathname, options = {}) => {
    const res = await request(pathname, options)
    return { res, body: await res.json().catch(() => null) }
  }
  const send = (body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return {
    jar,
    request,
    json,
    postJSON: (pathname, body) => json(pathname, send(body)),
    /** SSE 等需要自己读 body 的场景：返回原始 Response */
    postStream: (pathname, body) => request(pathname, send(body)),
  }
}

const postRecord = (client, record) => client.postJSON('/api/records', { record })

/** 读取 SSE 响应里的 data 行。 */
const readSSE = async (res) => {
  const text = await res.text()
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)))
}

before(async () => {
  const upstreamPort = await startUpstream()
  upstreamBase = `http://127.0.0.1:${upstreamPort}`
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'yijing-api-'))
  // 用固定的前端产物目录，避免测试依赖本机是否已 npm run build
  distDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'yijing-dist-'))
  await fsp.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>易经</title><div id="root"></div>')
  await fsp.mkdir(path.join(distDir, 'assets'))
  await fsp.writeFile(path.join(distDir, 'assets', 'app.js'), 'console.log(1)')
  const port = await freePort()
  base = `http://127.0.0.1:${port}`

  child = spawn(process.execPath, [path.join(HERE, '..', 'server.js')], {
    env: {
      ...process.env,
      YIJING_DATA_DIR: dataDir,
      YIJING_DIST: distDir,
      YIJING_PORT: String(port),
      YIJING_HOST: '127.0.0.1',
      YIJING_OWNER_TOKEN: OWNER_TOKEN,
      SESSION_SECRET: '',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  await waitForHealth()

  // 预置：owner 的 AI 配置指向测试上游
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  await owner.postJSON('/api/chat/key', { provider: 'custom', apiKey: 'sk-test-key' })
  await owner.postJSON('/api/chat/config', {
    provider: 'custom',
    providers: { custom: { model: 'mock-reasoner', baseURL: `http://127.0.0.1:${upstreamPort}/v1` } },
  })
})

after(async () => {
  child?.kill('SIGKILL')
  upstream?.close()
  await fsp.rm(dataDir, { recursive: true, force: true })
  await fsp.rm(distDir, { recursive: true, force: true })
})

test('访客首次访问拿到 cid cookie，且默认不是站长', async () => {
  const client = makeClient()
  const { res, body } = await client.json('/api/session')
  assert.equal(res.status, 200)
  assert.equal(body.owner, false)
  assert.equal(body.viewing, null)
  assert.match(body.cid, /^[a-f0-9]{16}$/)
  assert.ok(client.jar.get('yijing_cid'))
})

test('起卦记录按数据域隔离，访客互相看不到', async () => {
  const a = makeClient()
  const b = makeClient()
  await postRecord(a, { id: 'a1', question: '甲的问题', originalLines: [9, 7, 8, 7, 7, 8] })
  await postRecord(b, { id: 'b1', question: '乙的问题' })

  const listA = await a.json('/api/records')
  const listB = await b.json('/api/records')
  assert.deepEqual(listA.body.records.map((r) => r.id), ['a1'])
  assert.deepEqual(listB.body.records.map((r) => r.id), ['b1'])
})

test('记录保留全部起卦方式（manual / 卦库等不被降级成 threeCoins）', async () => {
  const client = makeClient()
  await postRecord(client, { id: 'm1', method: 'manual' })
  await postRecord(client, { id: 'm2', method: 'hexagramLibrary' })
  await postRecord(client, { id: 'm3', method: 'plumTime' })
  await postRecord(client, { id: 'm4', method: '三枚铜钱' })
  const { body } = await client.json('/api/records')
  const byId = Object.fromEntries(body.records.map((r) => [r.id, r.method]))
  assert.equal(byId.m1, 'manual')
  assert.equal(byId.m2, 'hexagramLibrary')
  assert.equal(byId.m3, 'plumTime')
  // 非法值仍收敛到默认值，避免脏数据
  assert.equal(byId.m4, 'threeCoins')
})

test('同 id 覆盖而非追加，按时间倒序排列', async () => {
  const client = makeClient()
  await postRecord(client, { id: 'dup', date: '2026-01-01T00:00:00.000Z', question: '第一版' })
  await postRecord(client, { id: 'other', date: '2026-02-01T00:00:00.000Z', question: '另一条' })
  await postRecord(client, { id: 'dup', date: '2026-01-01T00:00:00.000Z', question: '第二版' })
  const { body } = await client.json('/api/records')
  assert.equal(body.records.length, 2)
  // 覆盖保留原日期，排序仍按日期倒序
  assert.deepEqual(
    body.records.map((r) => [r.id, r.question]),
    [
      ['other', '另一条'],
      ['dup', '第二版'],
    ],
  )

  // 更新的记录若时间更新则排到最前
  await postRecord(client, { id: 'dup', date: '2026-03-01T00:00:00.000Z', question: '第三版' })
  const after = await client.json('/api/records')
  assert.deepEqual(
    after.body.records.map((r) => r.id),
    ['dup', 'other'],
  )
})

test('写入内容被白名单收敛（非法 method / 越界爻 / 超长提问）', async () => {
  const client = makeClient()
  const { body } = await postRecord(client, {
    id: 'dirty',
    method: '<script>alert(1)</script>',
    originalLines: [99, 7, 'x'],
    question: 'x'.repeat(5000),
    transcript: [
      { id: 'm', role: 'user', content: '问', reasoning: '' },
      { id: 'm2', role: 'system', content: '不该进来' },
    ],
    aiAnswer: 42,
    unknownField: 'dropped',
  })
  const record = body.record
  assert.equal(record.method, 'threeCoins')
  assert.deepEqual(record.originalLines, [7, 7, 7, 7, 7, 7])
  assert.equal(record.question.length, 200)
  assert.equal(record.aiAnswer, '')
  assert.equal(record.transcript.length, 1)
  assert.equal(record.transcript[0].role, 'user')
  assert.equal('unknownField' in record, false)
})

test('删除单条与清空全部', async () => {
  const client = makeClient()
  await postRecord(client, { id: 'x1' })
  await postRecord(client, { id: 'x2' })
  await client.request('/api/records', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'x1' }),
  })
  let list = await client.json('/api/records')
  assert.deepEqual(list.body.records.map((r) => r.id), ['x2'])

  await client.request('/api/records', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true }),
  })
  list = await client.json('/api/records')
  assert.deepEqual(list.body.records, [])
})

test('错误 owner token 被拒，正确 token 换到 cookie', async () => {
  const client = makeClient()
  const bad = await client.request('/?owner=nope')
  assert.equal(bad.status, 403)
  assert.equal(client.jar.has('yijing_owner'), false)

  const ok = await client.request(`/?owner=${OWNER_TOKEN}`)
  assert.equal(ok.status, 302)
  assert.equal(ok.headers.get('location'), '/')
  assert.equal(client.jar.get('yijing_owner'), OWNER_TOKEN)

  const { body } = await client.json('/api/session')
  assert.equal(body.owner, true)
})

test('站长记录与访客记录分开存放', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  await postRecord(owner, { id: 'owner-1', question: '站长的记录' })

  const visitor = makeClient()
  await postRecord(visitor, { id: 'visitor-1' })

  const ownerList = await owner.json('/api/records')
  assert.deepEqual(ownerList.body.records.map((r) => r.id), ['owner-1'])
  const visitorList = await visitor.json('/api/records')
  assert.deepEqual(visitorList.body.records.map((r) => r.id), ['visitor-1'])
})

test('访客清单仅站长可见，并含统计摘要', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  const { res, body } = await owner.json('/api/visitors')
  assert.equal(res.status, 200)
  assert.ok(body.visitors.length >= 2)
  for (const visitor of body.visitors) {
    assert.match(visitor.cid, /^[a-f0-9]{16}$/)
    assert.equal(typeof visitor.count, 'number')
  }
  assert.equal(body.visitors.some((v) => v.cid === 'owner'), false)

  const guest = makeClient()
  assert.equal((await guest.json('/api/visitors')).res.status, 403)
})

test('站长切到访客数据域后只读', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  const { body: list } = await owner.json('/api/visitors')
  const cid = list.visitors[0].cid

  const view = await owner.request(`/?view=${cid}`)
  assert.equal(view.status, 302)
  assert.equal(owner.jar.get('yijing_view'), cid)

  const session = await owner.json('/api/session')
  assert.equal(session.body.owner, true)
  assert.equal(session.body.viewing, cid)

  const read = await owner.json('/api/records')
  assert.equal(read.res.status, 200)

  const write = await postRecord(owner, { id: 'should-not-write' })
  assert.equal(write.res.status, 403)
  const del = await owner.request('/api/records', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true }),
  })
  assert.equal(del.status, 403)

  // 复位回自己
  await owner.request('/?view=')
  assert.equal(owner.jar.has('yijing_view'), false)
  assert.equal((await postRecord(owner, { id: 'after-reset' })).res.status, 200)
})

test('AI 配置接口仅站长可写，且不回传明文 Key', async () => {
  const guest = makeClient()
  assert.equal((await guest.postJSON('/api/chat/config', { temperature: 1 })).res.status, 403)
  assert.equal((await guest.postJSON('/api/chat/key', { provider: 'custom', apiKey: 'sk-x' })).res.status, 403)
  assert.equal((await guest.postJSON('/api/chat/models', {})).res.status, 403)

  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  const { body } = await owner.json('/api/chat/state')
  assert.equal(body.hasKey, true)
  assert.match(body.keyHint, /^sk-t…-key$/)
  assert.equal(JSON.stringify(body).includes('sk-test-key'), false)
  assert.equal(body.providers.find((p) => p.id === 'custom').hasKey, true)

  const models = await owner.postJSON('/api/chat/models', { provider: 'custom' })
  assert.deepEqual(models.body.models.map((m) => m.id), ['mock-reasoner', 'mock-plain'])
  assert.equal(seenAuth.at(-1), 'Bearer sk-test-key')
})

test('拉取模型列表用的是「所选 provider」自己的 Key 与 Base URL', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  // deepseek 槽位单独存一个 Key，并指向测试上游
  await owner.postJSON('/api/chat/key', { provider: 'deepseek', apiKey: 'sk-deepseek-key' })
  await owner.postJSON('/api/chat/config', {
    providers: { deepseek: { baseURL: `${upstreamBase}/v1`, model: 'deepseek-flash' } },
  })

  // 当前生效的仍是 custom（sk-test-key），但请求 deepseek 时必须用 deepseek 的 Key
  const state = (await owner.json('/api/chat/state')).body
  assert.equal(state.provider, 'custom')

  const res = await owner.postJSON('/api/chat/models', { provider: 'deepseek' })
  assert.equal(res.res.status, 200)
  assert.equal(seenAuth.at(-1), 'Bearer sk-deepseek-key')

  // 空串表示「清空 → 回落预设默认值」
  const restored = (await owner.postJSON('/api/chat/config', { providers: { deepseek: { baseURL: '' } } })).body
  assert.ok(restored.providers, '配置接口应回传新的槽位快照')
  const deepseek = restored.providers.find((p) => p.id === 'deepseek')
  assert.equal(deepseek.baseURL, 'https://api.deepseek.com')
  // 没传的字段不受影响
  assert.equal(deepseek.model, 'deepseek-flash')
  // 还原，避免影响后续用例
  await owner.postJSON('/api/chat/key', { provider: 'deepseek', apiKey: '' })
})

test('解读接口流式返回思考与正文双通道，并在末尾给出用量', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  const res = await owner.postStream('/api/interpret', {
    messages: [
      { role: 'system', content: '你是易经分析师' },
      { role: 'user', content: '运势如何' },
    ],
    thinking: true,
  })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)

  const events = await readSSE(res)
  const deltas = events.filter((e) => e.delta)
  assert.equal(deltas.length, 2)
  assert.equal(deltas[0].delta.reasoning, '先辨体用')
  assert.equal(deltas[1].delta.content, '得乾之坤。')

  const done = events.at(-1)
  assert.equal(done.done, true)
  assert.equal(done.text, '得乾之坤。')
  assert.equal(done.reasoning, '先辨体用')
  assert.equal(done.usage.promptTokens, 120)
  assert.equal(done.usage.cacheHitTokens, 20)
  assert.equal(done.usage.cacheMissTokens, 100)
  // 自定义服务商不估算费用
  assert.equal(done.usage.costCNY, null)

  // 转发到上游的请求体形状
  assert.equal(lastUpstreamBody.thinking.type, 'enabled')
  assert.equal(lastUpstreamBody.stream, true)
  assert.deepEqual(lastUpstreamBody.stream_options, { include_usage: true })
  assert.equal(lastUpstreamBody.messages.length, 2)
})

test('未配置 Key 时解读返回 503', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  await owner.postJSON('/api/chat/key', { provider: 'custom', apiKey: '' })
  const res = await owner.postStream('/api/interpret', { messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(res.status, 503)
  // 复原
  await owner.postJSON('/api/chat/key', { provider: 'custom', apiKey: 'sk-test-key' })
})

test('关闭访客 AI 后访客被拒，站长仍可用', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  await owner.postJSON('/api/chat/config', { visitorAi: false })

  const guest = makeClient()
  assert.equal((await guest.postJSON('/api/interpret', { messages: [{ role: 'user', content: 'hi' }] })).res.status, 403)
  const ownerRes = await owner.postStream('/api/interpret', {
    messages: [{ role: 'user', content: 'hi' }],
    thinking: false,
  })
  assert.equal(ownerRes.status, 200)
  assert.equal(lastUpstreamBody.thinking.type, 'disabled')

  await owner.postJSON('/api/chat/config', { visitorAi: true })
})

test('越权修改 provider 的槽位不会串到别的 provider', async () => {
  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  await owner.postJSON('/api/chat/config', { providers: { deepseek: { model: 'deepseek-reasoner' } } })
  const { body } = await owner.json('/api/chat/state')
  assert.equal(body.providers.find((p) => p.id === 'deepseek').model, 'deepseek-reasoner')
  assert.equal(body.providers.find((p) => p.id === 'custom').model, 'mock-reasoner')
  assert.equal(body.provider, 'custom')
})

test('非法 JSON、超大请求体与非法角色被挡下', async () => {
  const guest = makeClient()
  const badJson = await guest.request('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{坏',
  })
  assert.equal(badJson.status, 400)

  const huge = await guest.request('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ record: { id: 'big', question: 'x'.repeat(300 * 1024) } }),
  })
  assert.equal(huge.status, 413)

  const owner = makeClient()
  await owner.request(`/?owner=${OWNER_TOKEN}`)
  const res = await owner.postStream('/api/interpret', {
    messages: [{ role: 'tool', content: 'x' }, { role: 'user', content: '   ' }],
  })
  assert.equal(res.status, 400)
})

test('解读接口限流：同一数据域一分钟内超过 10 次被拒', async () => {
  const guest = makeClient()
  /** @type {number[]} */
  const statuses = []
  for (let i = 0; i < 12; i += 1) {
    const res = await guest.postStream('/api/interpret', {
      messages: [{ role: 'user', content: `第 ${i} 次` }],
      thinking: false,
    })
    statuses.push(res.status)
  }
  assert.equal(statuses.slice(0, 10).every((s) => s === 200), true)
  assert.equal(statuses[10], 429)
  assert.equal(statuses[11], 429)

  // 另一个访客独立计数
  const other = makeClient()
  const ok = await other.postStream('/api/interpret', { messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(ok.status, 200)
})

test('静态路由：SPA 回退可用、目录穿越不泄露、未知 API 返回 404', async () => {
  // 根路径与无扩展名的前端路由都回退到 index.html
  const root = await fetch(`${base}/`)
  assert.equal(root.status, 200)
  assert.match(await root.text(), /id="root"/)
  const spa = await fetch(`${base}/records/deadbeef`)
  assert.equal(spa.status, 200)
  assert.match(await spa.text(), /id="root"/)
  // assets 下的文件照发，并带 immutable 缓存头
  const asset = await fetch(`${base}/assets/app.js`)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('cache-control') ?? '', /immutable/)

  // 目录穿越：绝不能把 dist 之外的文件吐出来
  const traversal = await fetch(`${base}/../../etc/passwd`)
  const leak = await traversal.text()
  assert.doesNotMatch(leak, /root:/)
  assert.doesNotMatch(leak, /nobody|nologin/)
  const encoded = await fetch(`${base}/%2e%2e%2f%2e%2e%2fetc%2fpasswd`)
  assert.doesNotMatch(await encoded.text(), /root:/)

  // 缺资源与未知 API 都是 404（不回落 index.html）
  const missing = await fetch(`${base}/definitely-not-here.js`)
  assert.equal(missing.status, 404)
  const api404 = await fetch(`${base}/api/nope`)
  assert.equal(api404.status, 404)
})
