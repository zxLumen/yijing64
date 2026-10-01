/**
 * 大模型服务商：决定预设连接参数与各自独立存储的 Key。
 * 对齐 YijingCore/Services/LLMSettings.swift 的 LLMProvider。
 */

export const PROVIDERS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-flash',
    defaultBaseURL: 'https://api.deepseek.com',
  },
  {
    id: 'zhipu',
    label: '智谱',
    defaultModel: 'glm-4.7-flash',
    defaultBaseURL: 'https://open.bigmodel.cn/api/paas/v4',
  },
  {
    id: 'opencodeZen',
    label: 'opencode Zen',
    defaultModel: 'big-pickle',
    defaultBaseURL: 'https://opencode.ai/zen/v1',
  },
  {
    id: 'opencodeGo',
    label: 'opencode Go',
    defaultModel: 'deepseek-v4.1-flash',
    defaultBaseURL: 'https://opencode.ai/zen/go/v1',
  },
  { id: 'custom', label: '自定义', defaultModel: '', defaultBaseURL: '' },
]

/** @param {string} id */
export const providerById = (id) => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

/** 仅依据 Base URL 识别服务商；识别不到即 custom。 @param {string} baseURL */
export const detectProvider = (baseURL) => {
  const url = baseURL.toLowerCase()
  if (url.includes('opencode.ai')) return url.includes('/zen/go') ? 'opencodeGo' : 'opencodeZen'
  if (url.includes('deepseek')) return 'deepseek'
  if (url.includes('bigmodel.cn')) return 'zhipu'
  return 'custom'
}

/** 优先看 Base URL，其次才看模型名。 @param {string} model @param {string} baseURL */
export const detectProviderByModel = (model, baseURL) => {
  const byURL = detectProvider(baseURL)
  if (byURL !== 'custom') return byURL
  const m = model.toLowerCase()
  if (m.includes('deepseek')) return 'deepseek'
  if (m.includes('glm') || m.includes('chatglm')) return 'zhipu'
  return 'custom'
}
