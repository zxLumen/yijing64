import test from 'node:test'
import assert from 'node:assert/strict'

import { isPeakHour, mergeUsage, parseUsage, resolvePricing, withCost } from '../src/core/pricing.js'

test('usage 解析：DeepSeek 缓存细分字段', () => {
  const usage = parseUsage({
    prompt_tokens: 120,
    completion_tokens: 30,
    total_tokens: 150,
    prompt_cache_hit_tokens: 20,
    prompt_cache_miss_tokens: 100,
  })
  assert.deepEqual(usage, {
    promptTokens: 120,
    completionTokens: 30,
    totalTokens: 150,
    cacheHitTokens: 20,
    cacheMissTokens: 100,
    costCNY: null,
  })
})

test('usage 解析：OpenAI 兼容的 prompt_tokens_details.cached_tokens', () => {
  const usage = parseUsage({
    prompt_tokens: 100,
    completion_tokens: 10,
    prompt_tokens_details: { cached_tokens: 64 },
  })
  assert.equal(usage.cacheHitTokens, 64)
  assert.equal(usage.cacheMissTokens, 36)
  assert.equal(usage.totalTokens, 110)
})

test('usage 解析：无细分时保守按全部未命中；缺字段返回 null', () => {
  const usage = parseUsage({ prompt_tokens: 80, completion_tokens: 20 })
  assert.equal(usage.cacheHitTokens, 0)
  assert.equal(usage.cacheMissTokens, 80)
  assert.equal(parseUsage({ prompt_tokens: 1 }), null)
  assert.equal(parseUsage(null), null)
  assert.equal(parseUsage({}), null)
})

test('多轮用量累加', () => {
  const a = parseUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 })
  const b = parseUsage({ prompt_tokens: 20, completion_tokens: 7, total_tokens: 27 })
  const merged = mergeUsage(a, b)
  assert.equal(merged.promptTokens, 30)
  assert.equal(merged.completionTokens, 12)
  assert.equal(merged.totalTokens, 42)
  assert.equal(merged.cacheMissTokens, 30)
  // parse 出来的用量没有费用，合并结果为 0（与原生 TokenUsage.+ 一致）
  assert.equal(merged.costCNY, 0)

  // 各自算过费用的用量相加
  const priced = mergeUsage(
    withCost(a, { model: 'deepseek-flash', baseURL: 'https://api.deepseek.com' }),
    withCost(b, { model: 'deepseek-flash', baseURL: 'https://api.deepseek.com' }),
  )
  assert.ok(priced.costCNY > 0)

  assert.equal(mergeUsage(null, b), b)
  assert.equal(mergeUsage(a, null), a)
  assert.equal(mergeUsage(null, null), null)
})

test('按 Base URL 匹配单价档', () => {
  assert.deepEqual(resolvePricing('deepseek-flash', 'https://api.deepseek.com'), {
    cacheHit: 0.02,
    cacheMiss: 1,
    output: 4,
    peak: true,
  })
  assert.equal(resolvePricing('glm-4.7-flash', 'https://open.bigmodel.cn/api/paas/v4').output, 0)
  assert.equal(resolvePricing('glm-4.7', 'https://open.bigmodel.cn/api/paas/v4').output, 8)
  assert.equal(resolvePricing('gpt-x', 'https://opencode.ai/zen/v1'), null)
  assert.equal(resolvePricing('anything', 'https://my-proxy.example/v1'), null)
})

test('DeepSeek 高峰时段为闲时两倍（北京时间周一至五 9-12、14-18）', () => {
  // 2026-10-07 是周三；北京时间 = UTC+8
  const beijing = (h, m = 0) => new Date(Date.UTC(2026, 9, 7, h - 8, m))
  assert.equal(isPeakHour(beijing(10)), true)
  assert.equal(isPeakHour(beijing(11, 59)), true)
  assert.equal(isPeakHour(beijing(12)), false)
  assert.equal(isPeakHour(beijing(15)), true)
  assert.equal(isPeakHour(beijing(18)), false)
  assert.equal(isPeakHour(beijing(3)), false)
  // 2026-10-10 周六
  assert.equal(isPeakHour(new Date(Date.UTC(2026, 9, 10, 2))), false)
})

test('费用估算：闲时按官价，高峰翻倍；未识别服务商不估算', () => {
  const usage = parseUsage({
    prompt_tokens: 1_000_000,
    completion_tokens: 1_000_000,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 1_000_000,
  })
  const idle = new Date(Date.UTC(2026, 9, 7, 3)) // 北京时间 11:00 → 高峰
  const off = new Date(Date.UTC(2026, 9, 7, 20)) // 北京时间次日 04:00 → 闲时
  const config = { model: 'deepseek-flash', baseURL: 'https://api.deepseek.com' }

  const peak = withCost(usage, { ...config, at: idle })
  const normal = withCost(usage, { ...config, at: off })
  assert.equal(peak.costCNY, (1 + 4) * 2)
  assert.equal(normal.costCNY, 1 + 4)

  const zhipuFree = withCost(usage, { model: 'glm-4.7-flash', baseURL: 'https://open.bigmodel.cn/api/paas/v4' })
  assert.equal(zhipuFree.costCNY, 0)

  const unknown = withCost(usage, { model: 'x', baseURL: 'https://my-proxy.example/v1' })
  assert.equal(unknown.costCNY, null)

  assert.equal(withCost(null, config), null)
})
