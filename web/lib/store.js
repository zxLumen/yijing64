import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * 同 key 串行化，避免并发写互相覆盖。
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export const withLock = (key, fn) => {
  const prev = chains.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  chains.set(key, run.then(() => undefined, () => undefined))
  return run
}

/** @type {Map<string, Promise<void>>} */
const chains = new Map()

/** @param {string} dir */
export const ensureDir = (dir) => fsp.mkdir(dir, { recursive: true })

const readParsed = async (file) => {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * 读取 JSON；主文件损坏时回退 `.bak`。
 * @template T
 * @param {string} file
 * @param {T} fallback
 * @returns {Promise<T>}
 */
export const readJSON = async (file, fallback) => {
  const raw = await readParsed(file)
  if (raw !== undefined) return raw
  const backup = await readParsed(`${file}.bak`)
  return backup === undefined ? fallback : backup
}

/**
 * 原子写：先写临时文件并备份旧版，再 rename 覆盖。
 * @param {string} file
 * @param {unknown} value
 * @param {{ mode?: number }} [options]
 */
export const writeJSON = async (file, value, options = {}) => {
  await ensureDir(path.dirname(file))
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`)
  if (options.mode !== undefined) await fsp.chmod(tmp, options.mode)
  try {
    await fsp.copyFile(file, `${file}.bak`)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
  }
  await fsp.rename(tmp, file)
}

/**
 * @param {string} file
 * @param {string} fallback
 * @returns {Promise<string>}
 */
export const readText = async (file, fallback) => {
  try {
    return await fsp.readFile(file, 'utf8')
  } catch {
    return fallback
  }
}

/**
 * @param {string} file
 * @param {string} value
 * @param {{ mode?: number }} [options]
 */
export const writeText = async (file, value, options = {}) => {
  await ensureDir(path.dirname(file))
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, value)
  if (options.mode !== undefined) await fsp.chmod(tmp, options.mode)
  try {
    await fsp.copyFile(file, `${file}.bak`)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') throw err
  }
  await fsp.rename(tmp, file)
}
