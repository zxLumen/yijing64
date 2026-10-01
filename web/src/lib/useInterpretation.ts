import { useCallback, useRef, useState } from 'react'
import type { CastRecord, CastResult, DialogueTurn, TokenUsage } from '../core/types.js'
import { buildConversation, isDefaultReading } from '../core/hexagramInterpretation.js'
import { newTurn, interpret, saveRecord } from './api.js'
import { mergeUsage } from '../core/pricing.js'
import { reportAiState } from './aiStatus.js'
import { readState, useDebouncedSessionState } from './sessionState.js'

export type Interpretation = {
  transcript: DialogueTurn[]
  usage: TokenUsage | null
  question: string
  streaming: boolean
  error: string
  setQuestion: (value: string) => void
  /** 载入一条已有记录（或清空） */
  load: (record?: CastRecord | null) => void
  /** 提问；`record` 用于落库 */
  ask: (result: CastResult, record: CastRecord) => Promise<void>
  stop: () => void
}

type PersistedChat = { transcript: DialogueTurn[]; usage: TokenUsage | null; question: string }
const EMPTY_CHAT: PersistedChat = { transcript: [], usage: null, question: '' }

/**
 * 解卦会话状态：流式增量直接写进 transcript 最后一条助手消息，
 * 结束后把整条记录存回服务端（按数据域隔离）。
 *
 * `persistKey` 给出时，会话（对话 / 用量 / 输入框）随 sessionStorage 保存，
 * 整页刷新后自动恢复（约定见博客仓库 docs/APP-EMBED.md）。
 */
export function useInterpretation(onSaved?: (record: CastRecord) => void, persistKey?: string): Interpretation {
  const restored = persistKey ? readState<PersistedChat>(persistKey, EMPTY_CHAT) : EMPTY_CHAT
  const [transcript, setTranscript] = useState<DialogueTurn[]>(restored.transcript)
  const [usage, setUsage] = useState<TokenUsage | null>(restored.usage)
  const [question, setQuestion] = useState(restored.question)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  useDebouncedSessionState(persistKey ?? '', { transcript, usage, question })

  const load = useCallback((record?: CastRecord | null) => {
    if (abortRef.current) reportAiState('idle', '已切换')
    abortRef.current?.abort()
    abortRef.current = null
    setTranscript(record?.transcript ?? [])
    setUsage(record?.aiUsage ?? null)
    setQuestion('')
    setStreaming(false)
    setError('')
  }, [])

  const stop = useCallback(() => {
    if (abortRef.current) reportAiState('idle', '已停止')
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const ask = useCallback(
    async (result: CastResult, record: CastRecord) => {
      if (streaming) return
      const asked = question.trim()
      // 空白提问 = 默认解卦：丢掉历史，只按卦象解读（也不启用模型思考）
      const history = isDefaultReading(asked) ? [] : transcript
      const messages = buildConversation(result, asked, history)
      if (!messages.length) return

      const userTurn = newTurn('user', asked || '（默认解卦）')
      const assistantTurn = newTurn('assistant')
      const base: DialogueTurn[] = [...history, userTurn, assistantTurn]
      setTranscript(base)
      setQuestion('')
      setStreaming(true)
      setError('')

      const controller = new AbortController()
      abortRef.current = controller
      reportAiState('thinking', '正在解读')
      const patchLast = (fn: (turn: DialogueTurn) => DialogueTurn) =>
        setTranscript((prev) => {
          const next = [...prev]
          next[next.length - 1] = fn(next[next.length - 1])
          return next
        })

      try {
        const outcome = await interpret(messages, !isDefaultReading(asked), {
          signal: controller.signal,
          onDelta: (delta) =>
            patchLast((turn) => ({
              ...turn,
              content: turn.content + delta.content,
              reasoning: turn.reasoning + delta.reasoning,
            })),
        })
        const merged = mergeUsage(usage, outcome.usage)
        setUsage(merged)
        reportAiState('success', '解读完成')
        const saved = await saveRecord({
          ...record,
          aiAnswer: outcome.text || record.aiAnswer,
          transcript: base.map((turn, i) => (i === base.length - 1 ? { ...turn, content: outcome.text, reasoning: outcome.reasoning } : turn)),
          aiUsage: merged,
        })
        onSaved?.(saved)
      } catch (err) {
        const aborted = controller.signal.aborted
        // 中断也要把已收到的内容留下
        patchLast((turn) => (turn.content || turn.reasoning ? turn : { ...turn, content: '' }))
        reportAiState(aborted ? 'idle' : 'error', aborted ? undefined : '解读失败')
        if (!aborted) setError(err instanceof Error ? err.message : '解读失败。')
      } finally {
        abortRef.current = null
        setStreaming(false)
      }
    },
    [question, transcript, streaming, usage, onSaved],
  )

  return { transcript, usage, question, streaming, error, setQuestion, load, ask, stop }
}
