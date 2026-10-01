import type { CastRecord, TokenUsage, UsageSummary } from '../core/types.js'
import { mergeUsage } from '../core/pricing.js'

export const fmtDate = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const fmtTokens = (n: number) => {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

export const fmtCNY = (n: number | null) => {
  if (n === null || !Number.isFinite(n)) return '—'
  if (n === 0) return '免费'
  if (n < 0.01) return `¥${n.toFixed(4)}`
  return `¥${n.toFixed(2)}`
}

const zeroUsage = (): TokenUsage => ({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  costCNY: null,
})

/** 用量从记录派生（不另存一份统计表），与原生 TokenUsageStore 的口径一致。 */
export const summarizeUsage = (records: CastRecord[]): UsageSummary => {
  /** @type {Map<string, UsageByModel>} */
  const byModel = new Map()
  const summary = zeroUsage()
  let count = 0

  for (const record of records) {
    const usage = record.aiUsage
    if (!usage) continue
    count += 1
    summary.promptTokens += usage.promptTokens
    summary.completionTokens += usage.completionTokens
    summary.totalTokens += usage.totalTokens
    summary.cacheHitTokens += usage.cacheHitTokens
    summary.cacheMissTokens += usage.cacheMissTokens
    summary.costCNY = (summary.costCNY ?? 0) + (usage.costCNY ?? 0)

    const model = record.model || '未知模型'
    const prev = byModel.get(model) ?? { model, usage: zeroUsage(), count: 0 }
    prev.count += 1
    prev.usage = mergeUsage(prev.usage, usage)
    byModel.set(model, prev)
  }

  return {
    requestCount: count,
    promptTokens: summary.promptTokens,
    completionTokens: summary.completionTokens,
    totalTokens: summary.totalTokens,
    cacheHitTokens: summary.cacheHitTokens,
    cacheMissTokens: summary.cacheMissTokens,
    estimatedCostCNY: summary.costCNY ?? 0,
    byModel: [...byModel.values()].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens),
  }
}
