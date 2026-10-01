import crypto from 'node:crypto'
import path from 'node:path'

import { readText, writeText, ensureDir } from './store.js'

const CID_RE = /^[a-f0-9]{16}$/

/** 与博客 src/lib/auth.ts 的 ADMIN_COOKIE 同名同格式（`.zxlumen.cn` 域共享）。 */
const ADMIN_COOKIE = 'zx_admin'
const CID_COOKIE = 'yijing_cid'
const OWNER_COOKIE = 'yijing_owner'
const VIEW_COOKIE = 'yijing_view'

export const OWNER_SCOPE = 'owner'

/** @param {import('node:http').IncomingMessage} req */
export const parseCookies = (req) => {
  /** @type {Record<string, string>} */
  const out = {}
  const header = req.headers.cookie
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 1) continue
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

/**
 * 校验博客登录态：cookie 形如 `exp.hmac_sha256(SESSION_SECRET, exp)`。
 * 与 apps/next-home/src/lib/auth.ts 的 isAdmin 完全一致。
 * @param {Record<string, string>} cookies
 * @param {string | undefined} secret
 */
export const validBlogAdmin = (cookies, secret) => {
  const value = cookies[ADMIN_COOKIE]
  if (!value || !secret) return false
  const idx = value.indexOf('.')
  if (idx < 1) return false
  const exp = Number(value.slice(0, idx))
  const sig = value.slice(idx + 1)
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false
  const expected = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** @type {string | null} */
let cachedOwnerToken = null

/**
 * 站长 token：优先环境变量，否则在数据目录生成一份（0600）。
 * 用于「无博客登录态时直接进 /admin 式调试」的兜底链接。
 * @param {string} dataDir
 */
export const ownerToken = async (dataDir) => {
  if (cachedOwnerToken) return cachedOwnerToken
  const fromEnv = process.env.YIJING_OWNER_TOKEN || process.env.OWNER_TOKEN
  if (fromEnv && fromEnv.trim()) {
    cachedOwnerToken = fromEnv.trim()
    return cachedOwnerToken
  }
  const file = path.join(dataDir, 'owner.token')
  const existing = (await readText(file, '')).trim()
  if (existing) {
    cachedOwnerToken = existing
    return existing
  }
  const generated = crypto.randomBytes(16).toString('hex')
  await ensureDir(dataDir)
  await writeText(file, `${generated}\n`, { mode: 0o600 })
  cachedOwnerToken = generated
  return generated
}

/**
 * 解析当前请求的数据域：站长 / 访客 / 站长切到某访客（只读查看）。
 * @param {import('node:http').IncomingMessage} req
 * @param {{ dataDir: string, sessionSecret: string | undefined }} config
 */
export const resolveScope = async (req, { dataDir, sessionSecret }) => {
  const cookies = parseCookies(req)
  /** @type {string[]} */
  const setCookies = []
  const previousView = cookies[VIEW_COOKIE]

  const token = await ownerToken(dataDir)
  const owner = (!!token && cookies[OWNER_COOKIE] === token) || validBlogAdmin(cookies, sessionSecret)

  // 站长切到某个访客的数据域查看（只读；入口已把 ?view= 换成 cookie）。
  const viewRaw = cookies[VIEW_COOKIE]
  const viewOk = owner && typeof viewRaw === 'string' && CID_RE.test(viewRaw) ? viewRaw : null
  if (viewOk && viewOk !== previousView) setCookies.push(cookieValue(VIEW_COOKIE, viewOk))

  // 博客的 MOCK 身份（若将来把 zx_mock 也放到 .zxlumen.cn 域）优先于站长自身数据。
  const mock = cookies.zx_mock
  const mockOk = owner && typeof mock === 'string' && CID_RE.test(mock) ? mock : null

  const viewing = viewOk ?? mockOk
  let cid = cookies[CID_COOKIE]
  if (!CID_RE.test(cid ?? '')) {
    cid = crypto.randomBytes(8).toString('hex')
    setCookies.push(`${CID_COOKIE}=${cid}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`)
  }

  const scopeKey = owner && !viewing ? OWNER_SCOPE : (viewing ?? cid)
  return {
    owner,
    cid: /** @type {string} */ (cid),
    viewing,
    scopeKey,
    isOwnerScope: scopeKey === OWNER_SCOPE,
    setCookies,
  }
}

/**
 * @param {string} name
 * @param {string} value
 * @param {number} [maxAgeS]
 */
export const cookieValue = (name, value, maxAgeS = 31536000) =>
  `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeS}; SameSite=Lax; HttpOnly`

export { CID_RE }
