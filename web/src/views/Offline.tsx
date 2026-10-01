import { useMemo, useState } from 'react'
import type { CastRecord, CastResult, Hexagram, LineType } from '../core/types.js'
import { ALL, findByNumber } from '../core/hexagramData.js'
import { search } from '../core/hexagramSearch.js'
import { OLD_YANG, OLD_YIN, YOUNG_YANG, YOUNG_YIN, isYang } from '../core/lineType.js'
import { castResult, movingLines } from '../core/castResult.js'
import CastResultView from '../components/CastResultView.js'
import ChatStream from '../components/ChatStream.js'
import { useInterpretation } from '../lib/useInterpretation.js'
import { newId, saveRecord, type SessionInfo } from '../lib/api.js'

const POSITION = ['初', '二', '三', '四', '五', '上']

type Props = { session: SessionInfo; onSaved: (record: CastRecord) => void }

/**
 * 线下排卦：当面/事后手动记录卦象 —— 选本卦、标动爻（自动得出变卦），存入记录。
 */
export default function OfflineView({ session, onSaved }: Props) {
  const [query, setQuery] = useState('')
  const [number, setNumber] = useState(1)
  const [moving, setMoving] = useState<Set<number>>(new Set())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const chat = useInterpretation(onSaved)

  const list = useMemo(() => (query.trim() ? search(query) : ALL), [query])
  const hexagram: Hexagram | undefined = findByNumber(number)

  /** 由本卦 + 动爻推出六爻（动爻为老阳 9 / 老阴 6）。 */
  const lines: LineType[] = useMemo(() => {
    const out: LineType[] = []
    for (let i = 0; i < 6; i += 1) {
      // 本卦第 i 爻（初爻为最低位）：1 为阳 7，0 为阴 8
      const base: LineType = ((hexagram?.lines ?? 0) >> i) & 1 ? YOUNG_YANG : YOUNG_YIN
      if (moving.has(i)) {
        out.push(base === YOUNG_YANG ? OLD_YANG : OLD_YIN)
        continue
      }
      out.push(base)
    }
    return out
  }, [hexagram, moving])

  const result: CastResult | null = hexagram ? castResult('manual', lines) : null

  const pick = (next: number) => {
    setNumber(next)
    setMoving(new Set())
    setSavedId(null)
    chat.load(null)
  }

  const toggle = (i: number) => {
    setSavedId(null)
    setMoving((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // 卦象与 id 只随「本卦 + 动爻」变化生成一次；备注改动不影响 id
  const base: CastRecord | null = useMemo(
    () =>
      result
        ? {
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
          }
        : null,
    [result, session.model, session.provider],
  )
  const record: CastRecord | null = useMemo(
    () => (base ? { ...base, question: note.trim() } : null),
    [base, note],
  )
  const saved = !!base && savedId === base.id

  const persist = async () => {
    if (!record) return
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
        <h3>选本卦</h3>
        <input type="search" value={query} placeholder="搜卦名 / 全名 / 卦序 / 爻辞" onChange={(e) => setQuery(e.target.value)} />
        <div className="hexagram-grid">
          {list.map((item) => (
            <button
              key={item.kingWenNumber}
              type="button"
              className={item.kingWenNumber === number ? 'active' : ''}
              onClick={() => pick(item.kingWenNumber)}
            >
              <b>{item.name}</b>
              <span>{item.fullName}</span>
              <i>{item.kingWenNumber}</i>
            </button>
          ))}
          {!list.length && <p className="hint">没有匹配的卦。</p>}
        </div>
      </section>

      {result && hexagram && (
        <section className="card">
          <h3>标动爻（点击切换，不动即静爻）</h3>
          <div className="toggle-lines">
            {POSITION.map((label, i) => {
              const idx = 5 - i
              const yang = isYang(lines[idx])
              return (
                <button key={idx} type="button" data-on={moving.has(idx) || undefined} onClick={() => toggle(idx)}>
                  <span>{label}</span>
                  <b>{yang ? '▬▬▬' : '▬▬ ▬▬'}</b>
                  <i>{moving.has(idx) ? (yang ? '○ 老阳' : '✕ 老阴') : yang ? '少阳' : '少阴'}</i>
                </button>
              )
            })}
          </div>
          <p className="hint">已选 {moving.size} 个动爻{movingLines(result).length ? `：${[...moving].sort((a, b) => a - b).map((i) => `${POSITION[i]}${isYang(lines[i]) ? '九' : '六'}`).join('、')}` : ''}</p>
        </section>
      )}

      <section className="card">
        <label className="field">
          记录说明（会作为提问一起保存）
          <input type="text" value={note} maxLength={200} placeholder="如：面试结果、合伙、搬家…" onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      {result && (
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
              onAsk={() => record && chat.ask(result, record)}
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
      )}
    </div>
  )
}
