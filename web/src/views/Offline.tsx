import { useMemo, useState } from 'react'
import type { CastRecord, CastResult, LineType } from '../core/types.js'
import {
  YOUNG_YANG,
  YOUNG_YIN,
  isYang,
  isMoving,
  name as lineTypeName,
  nextLineType,
  downgradeLine,
  lineRows,
} from '../core/lineType.js'
import { castResult } from '../core/castResult.js'
import { lineTitle } from '../core/hexagram.js'
import { LineGlyph } from '../components/HexagramLine.js'
import CastResultView from '../components/CastResultView.js'
import ChatStream from '../components/ChatStream.js'
import { useInterpretation } from '../lib/useInterpretation.js'
import { newId, saveRecord, type SessionInfo } from '../lib/api.js'

const ALL_YOUNG_YANG: LineType[] = Array.from({ length: 6 }, () => YOUNG_YANG)

type Props = { session: SessionInfo; onSaved: (record: CastRecord) => void }

/**
 * 线下排卦：当面/事后手动录入卦象 —— 逐爻点击切换（可设动爻），实时得出本卦 / 变卦，存入记录。
 */
export default function OfflineView({ session, onSaved }: Props) {
  const [allowMoving, setAllowMoving] = useState(false)
  const [lines, setLines] = useState<LineType[]>(ALL_YOUNG_YANG)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const chat = useInterpretation(onSaved)

  const result: CastResult = useMemo(() => castResult('manual', lines), [lines])
  const movingCount = lines.filter(isMoving).length

  /** 改爻后旧记录即失效；清空已保存标记与进行中的解读。 */
  const setLinesAndReset = (next: LineType[]) => {
    setLines(next)
    setSavedId(null)
    chat.load(null)
  }

  const toggleLine = (i: number) => {
    setLinesAndReset(
      lines.map((line, idx) => {
        if (idx !== i) return line
        return allowMoving ? nextLineType(line) : isYang(line) ? YOUNG_YIN : YOUNG_YANG
      }),
    )
  }

  const toggleAllowMoving = () => {
    if (allowMoving) {
      setLinesAndReset(lines.map(downgradeLine))
      setAllowMoving(false)
      return
    }
    setAllowMoving(true)
  }

  const reset = () => setLinesAndReset(ALL_YOUNG_YANG)

  // 卦象与 id 只随六爻变化生成一次；备注改动不影响 id
  const base: CastRecord = useMemo(
    () => ({
      id: newId(),
      date: new Date().toISOString(),
      method: 'manual',
      originalLines: result.originalLines,
      question: '',
      aiAnswer: '',
      transcript: [],
      aiUsage: null,
      model: session.model,
      provider: session.provider,
    }),
    [result, session.model, session.provider],
  )
  const record: CastRecord = useMemo(() => ({ ...base, question: note.trim() }), [base, note])
  const saved = savedId === base.id

  const persist = async () => {
    setError('')
    try {
      const stored = await saveRecord({ ...record, transcript: chat.transcript, aiUsage: chat.usage })
      setSavedId(stored.id)
      onSaved(stored)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。')
    }
  }

  const aiDisabled = !session.hasAi
  const aiHint = session.hasAi ? '' : session.visitorAi ? '站长尚未配置 API Key，暂不能解读。' : '站长暂未开放访客使用 AI。'

  return (
    <div className="view">
      <section className="card">
        <h3>逐爻设置</h3>
        <label className="check allow-moving">
          <input type="checkbox" checked={allowMoving} onChange={toggleAllowMoving} />
          可设动爻（开启后可点出老阴 / 老阳）
        </label>
        <div className="line-legend">
          <span>
            <b>─</b> 少阳
          </span>
          <span>
            <b>─ ─</b> 少阴
          </span>
          {allowMoving && (
            <>
              <span>
                <b data-mark="○">○</b> 老阳（动）
              </span>
              <span>
                <b data-mark="✕">✕</b> 老阴（动）
              </span>
            </>
          )}
        </div>
        <div className="line-editor">
          {lineRows().map(({ idx }) => {
            const line = lines[idx]
            return (
              <button
                key={idx}
                type="button"
                className="line-editor-row"
                data-moving={isMoving(line) || undefined}
                onClick={() => toggleLine(idx)}
              >
                <span className="line-label">{lineTitle(result.original, idx)}</span>
                <LineGlyph line={line} />
                <span className="line-type">{lineTypeName(line)}</span>
                <i className="chevron">⌃⌄</i>
              </button>
            )
          })}
        </div>
        <div className="line-editor-foot">
          <button type="button" className="ghost" onClick={reset}>
            重置
          </button>
          <span className="hint">共 {movingCount} 个动爻</span>
        </div>
      </section>

      <section className="card">
        <label className="field">
          记录说明（会作为提问一起保存）
          <input type="text" value={note} maxLength={200} placeholder="如：面试结果、合伙、搬家…" onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <CastResultView result={result}>
        <section className="card">
          <h3>AI 解卦</h3>
          <ChatStream
            transcript={chat.transcript}
            streaming={chat.streaming}
            error={chat.error}
            usage={chat.usage}
            disabled={aiDisabled}
            disabledHint={aiHint}
            question={chat.question}
            onQuestionChange={chat.setQuestion}
            onAsk={() => chat.ask(result, record)}
            onStop={chat.stop}
          />
        </section>
        <div className="actions">
          <button type="button" className={saved ? 'ghost' : 'primary'} onClick={persist} disabled={saved}>
            {saved ? '已存入记录' : '存入记录'}
          </button>
          {error && <span className="chat-error">{error}</span>}
        </div>
      </CastResultView>
    </div>
  )
}
