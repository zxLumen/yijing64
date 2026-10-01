import path from 'node:path'

import { PROVIDERS, providerById } from '../src/core/providers.js'
import { readJSON, readText, withLock, writeJSON, writeText } from './store.js'

/** 与原生 LLMConfig / LLMChatViewModel 的默认值一致。 */
const DEFAULTS = {
  provider: 'deepseek',
  maxTokens: 1000,
  thinkingMaxTokens: 4000,
  temperature: 0.7,
  visitorAi: process.env.YIJING_VISITOR_AI !== '0',
}

/** @param {string} dataDir */
const settingsFile = (dataDir) => path.join(dataDir, 'settings.json')
/** @param {string} dataDir */
const keysFile = (dataDir) => path.join(dataDir, 'keys.json')

/** @param {string} dataDir */
export const loadSettings = async (dataDir) => normalize(await readJSON(settingsFile(dataDir), {}))

/** @param {string} dataDir @param {any} stored */
const normalize = (stored) => {
  const provider = PROVIDERS.some((p) => p.id === stored?.provider) ? stored.provider : DEFAULTS.provider
  /** @type {Record<string, { model: string, baseURL: string }>} */
  const providers = {}
  for (const preset of PROVIDERS) {
    const slot = stored?.providers?.[preset.id] ?? {}
    providers[preset.id] = {
      model: str(slot.model, preset.defaultModel),
      baseURL: str(slot.baseURL, preset.defaultBaseURL),
    }
  }
  return {
    provider,
    providers,
    maxTokens: clampInt(stored?.maxTokens, 256, 32000, DEFAULTS.maxTokens),
    thinkingMaxTokens: clampInt(stored?.thinkingMaxTokens, 256, 64000, DEFAULTS.thinkingMaxTokens),
    temperature: clampNum(stored?.temperature, 0, 2, DEFAULTS.temperature),
    visitorAi: typeof stored?.visitorAi === 'boolean' ? stored.visitorAi : DEFAULTS.visitorAi,
  }
}

/**
 * 合并保存（只接受白名单键）。
 * @param {string} dataDir
 * @param {any} patch
 */
export const saveSettings = (dataDir, patch) =>
  withLock('settings', async () => {
    const current = normalize(await readJSON(settingsFile(dataDir), {}))
    const next = { ...current }
    if (typeof patch?.provider === 'string' && PROVIDERS.some((p) => p.id === patch.provider)) {
      next.provider = patch.provider
    }
    if (patch?.providers && typeof patch.providers === 'object') {
      for (const preset of PROVIDERS) {
        const slot = patch.providers[preset.id]
        if (!slot || typeof slot !== 'object') continue
        const prev = current.providers[preset.id]
        // 没传的字段保持原值；显式传空串表示「清空 → 回落该 provider 的预设默认值」
        next.providers[preset.id] = {
          model: 'model' in slot ? str(slot.model, preset.defaultModel) : prev.model,
          baseURL: 'baseURL' in slot ? str(slot.baseURL, preset.defaultBaseURL) : prev.baseURL,
        }
      }
    }
    if (patch?.maxTokens !== undefined) next.maxTokens = clampInt(patch.maxTokens, 256, 32000, current.maxTokens)
    if (patch?.thinkingMaxTokens !== undefined) {
      next.thinkingMaxTokens = clampInt(patch.thinkingMaxTokens, 256, 64000, current.thinkingMaxTokens)
    }
    if (patch?.temperature !== undefined) next.temperature = clampNum(patch.temperature, 0, 2, current.temperature)
    if (typeof patch?.visitorAi === 'boolean') next.visitorAi = patch.visitorAi
    await writeJSON(settingsFile(dataDir), next)
    return next
  })

/**
 * 展开成实际发请求用的配置（含该 provider 槽位的 Key）。
 * @param {string} dataDir
 */
export const resolveConfig = async (dataDir) => {
  const settings = await loadSettings(dataDir)
  const slot = settings.providers[settings.provider]
  const keys = await readKeys(dataDir)
  return {
    provider: settings.provider,
    model: slot.model,
    baseURL: slot.baseURL,
    apiKey: keys[settings.provider] ?? '',
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    thinkingMaxTokens: settings.thinkingMaxTokens,
    visitorAi: settings.visitorAi,
  }
}

/** @param {string} dataDir */
export const readKeys = async (dataDir) => {
  const stored = await readJSON(keysFile(dataDir), {})
  /** @type {Record<string, string>} */
  const out = {}
  for (const preset of PROVIDERS) {
    const value = stored?.[preset.id]
    if (typeof value === 'string' && value.trim()) out[preset.id] = value.trim()
  }
  return out
}

/**
 * 写入某个 provider 的 Key（空串表示清除）。
 * @param {string} dataDir
 * @param {string} provider
 * @param {string} apiKey
 */
export const saveKey = (dataDir, provider, apiKey) =>
  withLock('keys', async () => {
    const keys = await readKeys(dataDir)
    const value = typeof apiKey === 'string' ? apiKey.trim() : ''
    if (value) keys[provider] = value
    else delete keys[provider]
    await writeJSON(keysFile(dataDir), keys, { mode: 0o600 })
    return keys
  })

/**
 * 供「关于」页展示的配置快照：绝不回传明文 Key。
 * @param {string} dataDir
 */
export const publicState = async (dataDir) => {
  const config = await resolveConfig(dataDir)
  const settings = await loadSettings(dataDir)
  const keys = await readKeys(dataDir)
  return {
    provider: config.provider,
    model: config.model,
    baseURL: config.baseURL,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    thinkingMaxTokens: config.thinkingMaxTokens,
    visitorAi: settings.visitorAi,
    hasKey: !!config.apiKey,
    keyHint: maskKey(config.apiKey),
    providers: PROVIDERS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      defaultModel: preset.defaultModel,
      defaultBaseURL: preset.defaultBaseURL,
      model: settings.providers[preset.id].model,
      baseURL: settings.providers[preset.id].baseURL,
      hasKey: !!keys[preset.id],
      keyHint: maskKey(keys[preset.id] ?? ''),
    })),
  }
}

/** @param {string} apiKey */
export const maskKey = (apiKey) => {
  if (!apiKey) return ''
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}…`
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

/** @param {string} id */
export const providerLabel = (id) => providerById(id).label

/** @param {any} value @param {string} fallback */
const str = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim() : fallback)

/** @param {any} value @param {number} min @param {number} max @param {number} fallback */
const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

/** @param {any} value @param {number} min @param {number} max @param {number} fallback */
const clampNum = (value, min, max, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
