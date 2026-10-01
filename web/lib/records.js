import fsp from 'node:fs/promises'
import path from 'node:path'

import { CID_RE, OWNER_SCOPE } from './scope.js'
import { isCastMethod } from '../src/core/castMethod.js'
import { readJSON, withLock, writeJSON } from './store.js'

/** 与原生 CastHistoryStore 一致的最多条数。 */
const MAX_RECORDS = 500
/** 单条记录序列化后的体积上限，防止有人往对话里灌超长文本。 */
const MAX_RECORD_BYTES = 512 * 1024
const MAX_ANSWER_CHARS = 100_000
const MAX_QUESTION_CHARS = 200
const MAX_TRANSCRIPT = 200
const MAX_MESSAGE_CHARS = 20_000

/** @param {string} dataDir */
const recordsDir = (dataDir) => path.join(dataDir, 'records')

/** @param {string} dataDir @param {string} scopeKey */
export const scopeFile = (dataDir, scopeKey) => path.join(recordsDir(dataDir), `${scopeKey}.json`)

/**
 * @param {string} dataDir
 * @param {string} scopeKey
 * @returns {Promise<import('../src/core/types.js').CastRecord[]>}
 */
export const listRecords = async (dataDir, scopeKey) => {
  const data = await readJSON(scopeFile(dataDir, scopeKey), { records: [] })
  return Array.isArray(data.records) ? data.records : []
}

/**
 * 新增或按 id 覆盖一条起卦记录。
 * @param {string} dataDir
 * @param {string} scopeKey
 * @param {unknown} input
 */
export const saveRecord = (dataDir, scopeKey, input) =>
  withLock(`records:${scopeKey}`, async () => {
    const record = sanitizeRecord(input)
    const file = scopeFile(dataDir, scopeKey)
    const data = await readJSON(file, { records: [] })
    const records = Array.isArray(data.records) ? data.records : []
    const idx = records.findIndex((r) => r.id === record.id)
    if (idx >= 0) records[idx] = record
    else records.push(record)
    // 与原生 CastHistoryStore.save 一致：按时间倒序
    records.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    await writeJSON(file, { records: records.slice(0, MAX_RECORDS) })
    return record
  })

/**
 * @param {string} dataDir
 * @param {string} scopeKey
 * @param {string} id
 */
export const deleteRecord = (dataDir, scopeKey, id) =>
  withLock(`records:${scopeKey}`, async () => {
    const file = scopeFile(dataDir, scopeKey)
    const data = await readJSON(file, { records: [] })
    const records = Array.isArray(data.records) ? data.records : []
    await writeJSON(file, { records: records.filter((r) => r.id !== id) })
  })

/** @param {string} dataDir @param {string} scopeKey */
export const clearRecords = (dataDir, scopeKey) =>
  withLock(`records:${scopeKey}`, async () => {
    await writeJSON(scopeFile(dataDir, scopeKey), { records: [] })
  })

/**
 * 访客清单（供站长查看访客起卦记录）：读 records/ 下各访客文件。
 * @param {string} dataDir
 */
export const listVisitors = async (dataDir) => {
  /** @type {string[]} */
  let names = []
  try {
    names = await fsp.readdir(recordsDir(dataDir))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const cid = name.slice(0, -'.json'.length)
    if (cid === OWNER_SCOPE || !CID_RE.test(cid)) continue
    const records = await listRecords(dataDir, cid)
    out.push({
      cid,
      count: records.length,
      updatedAt: typeof records[0]?.date === 'string' ? records[0].date : null,
      summary: summarize(records),
    })
  }
  out.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  return out
}

/**
 * @param {import('../src/core/types.js').CastRecord[]} records
 */
const summarize = (records) => {
  const asked = records.filter((r) => typeof r.question === 'string' && r.question.trim()).length
  const ai = records.filter((r) => typeof r.aiAnswer === 'string' && r.aiAnswer.trim()).length
  const lines = records.reduce((sum, r) => sum + countMoving(r), 0)
  return { asked, ai, lines }
}

/**
 * @param {import('../src/core/types.js').CastRecord} record
 */
const countMoving = (record) => {
  const list = Array.isArray(record?.originalLines) ? record.originalLines : []
  return list.filter((l) => l === 6 || l === 9).length
}

/**
 * 白名单收敛：只保留客户端可能用到的字段，并逐项限长/限枚举。
 * @param {any} input
 */
const sanitizeRecord = (input) => {
  const method = isCastMethod(input?.method) ? input.method : 'threeCoins'
  const originalLines = Array.isArray(input?.originalLines)
    ? input.originalLines.slice(0, 6).map((l) => (typeof l === 'number' && l >= 6 && l <= 9 ? Math.round(l) : 7))
    : []
  while (originalLines.length < 6) originalLines.push(7)

  const record = {
    id: typeof input?.id === 'string' && input.id.trim() && input.id.length <= 64 ? input.id.trim() : newId(),
    date: typeof input?.date === 'string' && input.date.length <= 40 ? input.date : new Date().toISOString(),
    method,
    originalLines,
    question: text(input?.question, MAX_QUESTION_CHARS),
    aiAnswer: text(input?.aiAnswer, MAX_ANSWER_CHARS),
    transcript: sanitizeTranscript(input?.transcript),
    aiUsage: sanitizeUsage(input?.aiUsage),
    model: text(input?.model, 64),
    provider: text(input?.provider, 64),
  }

  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > MAX_RECORD_BYTES) {
    record.transcript = []
  }
  return record
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** @param {any} value @param {number} max */
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '')

/** @param {any} value */
const sanitizeTranscript = (value) => {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_TRANSCRIPT).flatMap((item) => {
    const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : null
    if (!role) return []
    return [
      {
        id: text(item?.id, 64),
        role,
        content: text(item?.content, MAX_MESSAGE_CHARS),
        reasoning: text(item?.reasoning, MAX_MESSAGE_CHARS),
      },
    ]
  })
}

/** @param {any} value */
const sanitizeUsage = (value) => {
  if (!value || typeof value !== 'object') return null
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const cost = typeof value.costCNY === 'number' && Number.isFinite(value.costCNY) ? value.costCNY : null
  return {
    promptTokens: num(value.promptTokens),
    completionTokens: num(value.completionTokens),
    totalTokens: num(value.totalTokens),
    cacheHitTokens: num(value.cacheHitTokens),
    cacheMissTokens: num(value.cacheMissTokens),
    costCNY: cost,
  }
}
