import { mergeUsage, parseUsage, withCost } from '../src/core/pricing.js'

/**
 * OpenAI 兼容的上游调用：非流式取模型列表 + 流式对话（双通道：正文 / 思考）。
 * 对齐 YijingCore/Services/LLMClient.swift。
 */

/** 由 Base URL 构造 chat/completions 端点（容错结尾斜杠）。 @param {string} baseURL */
export const endpointURL = (baseURL) => {
  const trimmed = String(baseURL ?? '').trim()
  if (!trimmed) return null
  try {
    return new URL('chat/completions', trimmed.endsWith('/') ? trimmed : `${trimmed}/`)
  } catch {
    return null
  }
}

/** @param {string} baseURL */
export const modelsURL = (baseURL) => {
  const trimmed = String(baseURL ?? '').trim()
  if (!trimmed) return null
  try {
    return new URL('models', trimmed.endsWith('/') ? trimmed : `${trimmed}/`)
  } catch {
    return null
  }
}

/**
 * @param {{ apiKey: string, baseURL: string }} config
 * @param {string} sessionId opencode 网关要求带会话头才能路由
 * @returns {Record<string, string>}
 */
export const standardHeaders = (config, sessionId) => {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Yijing64/1.0',
  }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  if (String(config.baseURL).toLowerCase().includes('opencode.ai')) {
    headers['x-opencode-session'] = sessionId
  }
  return headers
}

/**
 * 构造 chat.completions 请求体。
 * @param {object} options
 * @returns {Record<string, unknown>}
 */
export const requestBody = ({
  model,
  messages,
  maxTokens,
  thinking,
  stream = false,
  includeUsage = false,
  temperature = 0.7,
}) => {
  const body = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature,
    max_tokens: maxTokens,
    stream,
    thinking: { type: thinking ? 'enabled' : 'disabled' },
  }
  if (stream && includeUsage) body.stream_options = { include_usage: true }
  return body
}

/** 从服务端错误正文提炼可读信息（限流 / 鉴权 / 余额不足等）。 @param {string} json */
export const friendlyDetail = (json) => {
  try {
    const obj = JSON.parse(json)
    const message = obj?.error?.message
    if (typeof message === 'string' && message.trim()) return message.trim()
  } catch {
    /* 非 JSON 正文 */
  }
  return '请检查网络或 Key 是否有效。'
}

/**
 * 解析一行 SSE（如 `data: {"choices":[{"delta":{"content":"…"}}]}`）。
 * @param {string} line
 */
export const parseChunk = (line) => {
  /** @type {{ reasoning: string, content: string, done: boolean, usage: import('../src/core/pricing.js').TokenUsage | null }} */
  const empty = { reasoning: '', content: '', done: false, usage: null }
  if (!line.startsWith('data:')) return empty
  let payload = line.slice('data:'.length)
  if (payload.startsWith(' ')) payload = payload.slice(1)
  const data = payload.trim()
  if (data === '[DONE]') return { ...empty, done: true }

  /** @type {any} */
  let obj
  try {
    obj = JSON.parse(data)
  } catch {
    return empty
  }

  // 流末尾的 usage 块（choices 为空且带 usage）。
  const usage = parseUsage(obj?.usage)
  if (usage) return { ...empty, usage }

  const first = Array.isArray(obj?.choices) ? obj.choices[0] : undefined
  if (!first) return empty
  const delta = first.delta ?? {}
  return {
    reasoning: typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '',
    content: typeof delta.content === 'string' ? delta.content : '',
    done: false,
    usage: null,
  }
}

/** 请求超时（含思考时间，故比原生 60s 宽松）。 */
const TIMEOUT_MS = 120_000

/**
 * 流式对话。`onDelta` 每次收到新块，`onUsage` 在流末尾收到 token 用量。
 * @param {object} options
 * @param {{ model: string, baseURL: string, apiKey: string, maxTokens: number, thinkingMaxTokens: number }} options.config
 * @param {{ role: string, content: string }[]} options.messages
 * @param {boolean} options.thinking
 * @param {string} options.sessionId
 * @param {(delta: { reasoning: string, content: string }) => void} [options.onDelta]
 * @param {AbortSignal} [options.signal]
 */
export const streamChat = async ({ config, messages, thinking, sessionId, onDelta, signal }) => {
  if (!config.apiKey) throw new Error('未设置 API Key，请先在「关于」页由站长填写。')
  const url = endpointURL(config.baseURL)
  if (!url) throw new Error('Base URL 无效。')

  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const response = await fetch(url, {
    method: 'POST',
    headers: standardHeaders(config, sessionId),
    body: JSON.stringify(
      requestBody({
        model: config.model,
        messages,
        maxTokens: thinking ? config.thinkingMaxTokens : config.maxTokens,
        thinking,
        stream: true,
        includeUsage: true,
        temperature: config.temperature ?? 0.7,
      }),
    ),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`请求失败（${response.status}）。${friendlyDetail(detail)}`)
  }
  if (!response.body) throw new Error('网络响应异常。')

  let text = ''
  let reasoning = ''
  /** @type {import('../src/core/pricing.js').TokenUsage | null} */
  let usage = null

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  /** @param {string} line */
  const handle = (line) => {
    const chunk = parseChunk(line)
    if (chunk.done) return true
    if (chunk.usage) {
      usage = chunk.usage
      return false
    }
    if (!chunk.reasoning && !chunk.content) return false
    text += chunk.content
    reasoning += chunk.reasoning
    onDelta?.({ reasoning: chunk.reasoning, content: chunk.content })
    return false
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n')
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (handle(line)) {
          await reader.cancel().catch(() => {})
          return { text, reasoning, usage: finishUsage(usage, config) }
        }
        idx = buffer.indexOf('\n')
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) handle(buffer.trim())
  } catch (err) {
    if (signal?.aborted) throw new Error('已取消。')
    if (timeout.aborted) throw new Error('请求超时，请稍后重试。')
    throw new Error(`流式响应中断：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    reader.cancel().catch(() => {})
  }

  return { text, reasoning, usage: finishUsage(usage, config) }
}

/**
 * @param {import('../src/core/pricing.js').TokenUsage | null} usage
 * @param {{ model: string, baseURL: string }} config
 */
const finishUsage = (usage, config) =>
  usage ? withCost(usage, { model: config.model, baseURL: config.baseURL }) : null

/**
 * 拉取服务端可用模型列表（OpenAI 兼容 `GET {base}/models`）。
 * 不强制要求 API Key：opencode 的模型目录公开可读。
 * @param {{ baseURL: string, apiKey: string }} config
 * @param {string} sessionId
 * @returns {Promise<{ id: string, label: string }[]>}
 */
export const fetchModels = async (config, sessionId) => {
  const url = modelsURL(config.baseURL)
  if (!url) throw new Error('Base URL 无效。')
  const response = await fetch(url, {
    method: 'GET',
    headers: standardHeaders(config, sessionId),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`获取模型列表失败（${response.status}）。${friendlyDetail(detail)}`)
  }
  /** @type {any} */
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('模型列表响应不是合法 JSON。')
  }
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  const models = list
    .map((/** @type {any} */ item) => (typeof item === 'string' ? item : item?.id))
    .filter((/** @type {any} */ id) => typeof id === 'string' && id.trim())
    .map((id) => ({ id: /** @type {string} */ (id), label: /** @type {string} */ (id) }))
  if (!models.length) throw new Error('未获取到模型列表。')
  return models
}

export { mergeUsage }
