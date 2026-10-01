import { detectProvider } from './providers.js'

/**
 * Token 用量解析与费用估算（元/百万 token）。
 * 对齐 YijingCore/Services/TokenUsage.swift。
 */

const BEIJING_OFFSET_MS = 8 * 3600 * 1000

/** DeepSeek flash 系列当前价（2026-09-10 生效；高峰时段为闲时 ×2）。 */
const DEEP_SEEK_FLASH = { cacheHit: 0.02, cacheMiss: 1, output: 4, peak: true }
/** 智谱免费档（glm-*-flash）：输入/输出/缓存全免费。 */
const ZHIPU_FREE = { cacheHit: 0, cacheMiss: 0, output: 0, peak: false }
/** 智谱付费 GLM 近似档。 */
const ZHIPU_DEFAULT = { cacheHit: 0.4, cacheMiss: 2, output: 8, peak: false }

/** 未识别服务商返回 null（不估算费用）。 @param {string} model @param {string} baseURL */
export const resolvePricing = (model, baseURL) => {
  const provider = detectProvider(baseURL)
  if (provider === 'deepseek') return DEEP_SEEK_FLASH
  if (provider === 'zhipu') {
    const m = model.toLowerCase()
    return m.includes('flash') || m.includes('free') ? ZHIPU_FREE : ZHIPU_DEFAULT
  }
  return null
}

/** DeepSeek 高峰时段：北京时间周一至五 9-12、14-18。 @param {Date} [date] */
export const isPeakHour = (date = new Date()) => {
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MS)
  const weekday = beijing.getUTCDay()
  if (weekday === 0 || weekday === 6) return false
  const hour = beijing.getUTCHours()
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18)
}

/**
 * 容错解析 OpenAI/DeepSeek 兼容的 usage 字典。
 * 缓存细分兼容 `prompt_cache_hit_tokens` 与 `prompt_tokens_details.cached_tokens`。
 * @param {Record<string, any> | null | undefined} json
 */
export const parseUsage = (json) => {
  if (!json || typeof json !== 'object') return null
  const prompt = int(json.prompt_tokens)
  const completion = int(json.completion_tokens)
  if (prompt === null || completion === null) return null

  let hit = int(json.prompt_cache_hit_tokens) ?? 0
  let miss = int(json.prompt_cache_miss_tokens) ?? 0
  if (hit === 0 && miss === 0) {
    const cached = int(json.prompt_tokens_details?.cached_tokens)
    if (cached !== null) {
      hit = Math.max(cached, 0)
      miss = Math.max(prompt - hit, 0)
    }
  }
  // 未细分时保守按全部未命中计。
  if (hit === 0 && miss === 0) miss = prompt

  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: int(json.total_tokens) ?? prompt + completion,
    cacheHitTokens: hit,
    cacheMissTokens: miss,
    costCNY: null,
  }
}

/**
 * @param {any} value
 * @returns {number | null}
 */
const int = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null)

/** 合并两段用量（多轮会话累计）。 @param {TokenUsage | null} a @param {TokenUsage | null} b */
export const mergeUsage = (a, b) => {
  if (!a) return b ?? null
  if (!b) return a
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cacheHitTokens: a.cacheHitTokens + b.cacheHitTokens,
    cacheMissTokens: a.cacheMissTokens + b.cacheMissTokens,
    costCNY: (a.costCNY ?? 0) + (b.costCNY ?? 0),
  }
}

/**
 * 按模型匹配的官方单价与请求时刻时段填充估算费用。
 * @param {TokenUsage | null} usage
 * @param {{ model: string, baseURL: string, at?: Date }} context
 */
export const withCost = (usage, { model, baseURL, at = new Date() }) => {
  if (!usage) return null
  const pricing = resolvePricing(model, baseURL)
  if (!pricing) return { ...usage, costCNY: null }
  const multiplier = pricing.peak && isPeakHour(at) ? 2 : 1
  const cost =
    (usage.cacheHitTokens / 1_000_000) * pricing.cacheHit * multiplier +
    (usage.cacheMissTokens / 1_000_000) * pricing.cacheMiss * multiplier +
    (usage.completionTokens / 1_000_000) * pricing.output * multiplier
  return { ...usage, costCNY: cost }
}

/**
 * @typedef {object} TokenUsage
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} totalTokens
 * @property {number} cacheHitTokens
 * @property {number} cacheMissTokens
 * @property {number | null} costCNY
 */
