import { useEffect, useRef, useState } from 'react'
import type { DialogueTurn, TokenUsage } from '../core/types.js'
import { isRelevant, REFUSAL } from '../core/divinationTopic.js'
import { fmtCNY, fmtTokens } from '../lib/format.js'

/** 极简排版：按空行分段，避免引入 markdown 依赖。 */
function Prose({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim())
  if (!blocks.length) return null
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i}>{block}</p>
      ))}
    </>
  )
}

function Reasoning({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <div className="reasoning" data-live={live || undefined}>
      <button type="button" className="link" onClick={() => setOpen((v) => !v)}>
        {open ? '收起思考过程' : live ? '思考中…（点击展开）' : `思考过程（${text.length} 字）`}
      </button>
      {open && (
        <div className="reasoning-body">
          <Prose text={text} />
        </div>
      )}
    </div>
  )
}

type Props = {
  transcript: DialogueTurn[]
  streaming: boolean
  error: string
  usage: TokenUsage | null
  disabled: boolean
  disabledHint: string
  question: string
  onQuestionChange: (value: string) => void
  onAsk: () => void
  onStop: () => void
}

/**
 * AI 解卦对话区。留空提问 = 默认解卦（服务端关思考）；问题与卦象无关时本地拦截。
 */
export default function ChatStream({
  transcript,
  streaming,
  error,
  usage,
  disabled,
  disabledHint,
  question,
  onQuestionChange,
  onAsk,
  onStop,
}: Props) {
  const endRef = useRef<HTMLDivElement | null>(null)
  const last = transcript[transcript.length - 1]
  const live = streaming && last?.role === 'assistant' ? last : null

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [transcript, live?.content.length, live?.reasoning.length])

  const reject = question.trim().length > 0 && !isRelevant(question)

  return (
    <div className="chat">
      <div className="chat-log">
        {transcript.length === 0 && (
          <p className="chat-empty">
            留空直接点「解卦」= 按本卦卦辞做默认解读；写下你的问题则结合卦象与所问之事解读。
          </p>
        )}
        {transcript.map((turn, i) =>
          turn.role === 'user' ? (
            <div key={turn.id} className="chat-turn user">
              <div className="bubble">{turn.content}</div>
            </div>
          ) : (
            <div key={turn.id} className="chat-turn assistant" data-live={turn === live || undefined}>
              <Reasoning text={turn.reasoning} live={turn === live} />
              <div className="bubble">
                {turn.content ? (
                  <Prose text={turn.content} />
                ) : turn === live ? (
                  <span className="typing">正在解读…</span>
                ) : (
                  <span className="typing">（无内容）</span>
                )}
              </div>
            </div>
          ),
        )}

        {error && <p className="chat-error">{error}</p>}
        <div ref={endRef} />
      </div>

      {usage && !streaming && (
        <p className="chat-usage">
          累计 {fmtTokens(usage.totalTokens)} tokens（输入 {fmtTokens(usage.promptTokens)} / 输出{' '}
          {fmtTokens(usage.completionTokens)}，缓存命中 {fmtTokens(usage.cacheHitTokens)}）· 预估费用 {fmtCNY(usage.costCNY)}
        </p>
      )}

      {reject && <p className="chat-warn">{REFUSAL}</p>}
      {!reject && disabled && <p className="chat-warn">{disabledHint}</p>}

      <div className="chat-input">
        <input
          type="text"
          value={question}
          maxLength={200}
          placeholder="想问什么？留空即默认解卦"
          onChange={(e) => onQuestionChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) onAsk()
          }}
          disabled={disabled || reject}
        />
        {streaming ? (
          <button type="button" className="ghost" onClick={onStop}>
            停止
          </button>
        ) : (
          <button type="button" onClick={onAsk} disabled={disabled || reject}>
            解卦
          </button>
        )}
      </div>
    </div>
  )
}
