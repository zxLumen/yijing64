import type { CastRecord, TokenUsage, DialogueRole } from '../core/types.js'

export type SessionInfo = {
  owner: boolean
  viewing: string | null
  cid: string
  visitorAi: boolean
  hasAi: boolean
  provider: string
  model: string
}

export type ProviderSlot = {
  id: string
  label: string
  defaultModel: string
  defaultBaseURL: string
  model: string
  baseURL: string
  hasKey: boolean
  keyHint: string
}

export type ChatState = {
  provider: string
  model: string
  baseURL: string
  temperature: number
  maxTokens: number
  thinkingMaxTokens: number
  visitorAi: boolean
  hasKey: boolean
  keyHint: string
  providers: ProviderSlot[]
}

export type VisitorInfo = {
  cid: string
  count: number
  updatedAt: string | null
  summary: { asked: number; ai: number; lines: number }
}

export type ModelOption = { id: string; label: string }

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** @param {Response} res */
const unwrap = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `请求失败（${res.status}）`)
  }
  return res.json() as Promise<T>
}

const postJSON = (pathname: string, body: unknown, signal?: AbortSignal) =>
  fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export const getSession = () => fetch('/api/session').then((r) => unwrap<SessionInfo>(r))

export const getRecords = () =>
  fetch('/api/records').then((r) => unwrap<{ records: CastRecord[] }>(r)).then((d) => d.records)

export const saveRecord = (record: CastRecord) =>
  postJSON('/api/records', { record }).then((r) => unwrap<{ record: CastRecord }>(r)).then((d) => d.record)

/** @param {string} pathname @param {unknown} body @param {AbortSignal} [signal] */
const delJSON = (pathname: string, body: unknown, signal?: AbortSignal) =>
  fetch(pathname, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export const deleteRecord = (id: string) => delJSON('/api/records', { id }).then((r) => unwrap(r))

export const clearRecords = () => delJSON('/api/records', { all: true }).then((r) => unwrap(r))

export const getChatState = () => fetch('/api/chat/state').then((r) => unwrap<ChatState>(r))

export const saveChatConfig = (patch: Record<string, unknown>) =>
  postJSON('/api/chat/config', patch).then((r) => unwrap<ChatState>(r))

export const saveChatKey = (provider: string, apiKey: string) =>
  postJSON('/api/chat/key', { provider, apiKey }).then((r) => unwrap<ChatState>(r))

export const fetchModels = (provider: string) =>
  postJSON('/api/chat/models', { provider }).then((r) => unwrap<{ models: ModelOption[] }>(r)).then((d) => d.models)

export const getVisitors = () => fetch('/api/visitors').then((r) => unwrap<{ visitors: VisitorInfo[] }>(r)).then((d) => d.visitors)

export const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export type InterpretResult = { text: string; reasoning: string; usage: TokenUsage | null }

/**
 * 流式解读。SSE 事件：`{delta:{reasoning,content}}` / `{done:true,text,reasoning,usage}` / `{error:{message}}`。
 */
export const interpret = async (
  messages: ChatMessage[],
  thinking: boolean,
  handlers: { onDelta?: (delta: { reasoning: string; content: string }) => void; signal?: AbortSignal } = {},
): Promise<InterpretResult> => {
  const res = await postJSON('/api/interpret', { messages, thinking }, handlers.signal)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `请求失败（${res.status}）`)
  }
  if (!res.body) throw new Error('当前浏览器不支持流式响应。')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  /** @type {InterpretResult} */
  let result: InterpretResult = { text: '', reasoning: '', usage: null }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx = buffer.indexOf('\n')
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      idx = buffer.indexOf('\n')
      if (!line.startsWith('data: ')) continue
      const payload = line.slice('data: '.length)
      if (payload === '[DONE]') continue
      /** @type {any} */
      let event
      try {
        event = JSON.parse(payload)
      } catch {
        continue
      }
      if (event.delta) handlers.onDelta?.(event.delta)
      else if (event.error) throw new Error(event.error.message ?? 'AI 请求失败。')
      else if (event.done) result = { text: event.text ?? '', reasoning: event.reasoning ?? '', usage: event.usage ?? null }
    }
  }
  return result
}

export const newTurn = (role: DialogueRole, content = ''): CastRecord['transcript'][number] => ({
  id: newId(),
  role,
  content,
  reasoning: '',
})
