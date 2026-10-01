import { useMemo, useState } from 'react'
import type { CastRecord, CastResult } from '../core/types.js'
import { ALL, contentByNumber, findByNumber } from '../core/hexagramData.js'
import { staticLines } from '../core/lineType.js'
import { mutual, opposite, inverse, upper, lower, lineTitle } from '../core/hexagram.js'
import { palaceRankLabel } from '../core/hexagramData.js'
import { search } from '../core/hexagramSearch.js'
import { symbol, name as trigramName } from '../core/trigram.js'
import { fromHexagram } from '../core/castResult.js'
import HexagramBoard from '../components/HexagramBoard.js'
import { MiniHexagram } from '../components/HexagramLine.js'
import ChatStream from '../components/ChatStream.js'
import { useInterpretation } from '../lib/useInterpretation.js'
import { newId, type SessionInfo } from '../lib/api.js'

type Props = { session: SessionInfo }

export default function LibraryView({ session }: Props) {
  const [query, setQuery] = useState('')
  const [number, setNumber] = useState<number | null>(null)
  const chat = useInterpretation()

  const list = useMemo(() => (query.trim() ? search(query) : ALL), [query])
  const hexagram = useMemo(() => (number === null ? null : findByNumber(number)), [number])
  const result: CastResult | null = useMemo(
    () => (hexagram ? fromHexagram('hexagramLibrary', hexagram) : null),
    [hexagram],
  )

  // 记录对象只随所选卦象生成一次：AI 自动落库与手动保存复用同一个 id
  const record: CastRecord | null = useMemo(
    () =>
      result
        ? {
            id: newId(),
            date: new Date().toISOString(),
            method: 'hexagramLibrary',
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

  const pick = (next: number) => {
    setNumber(next)
    chat.load(null)
  }

  const aiDisabled = !session.hasAi
  const aiHint = session.hasAi ? '' : session.visitorAi ? '站长尚未配置 API Key，暂不能解读。' : '站长暂未开放访客使用 AI。'

  return (
    <div className="view library">
      <section className="card">
        <input
          type="search"
          value={query}
          placeholder="搜卦名、全名、卦序或爻辞，如「乾」「天泽履」「13」「潜龙勿用」"
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="hint">共 {list.length} 卦{query.trim() ? `（匹配「${query.trim()}」）` : ''}</p>
        <div className="hexagram-grid">
          {list.map((item) => (
            <button
              key={item.kingWenNumber}
              type="button"
              className={item.kingWenNumber === number ? 'active' : ''}
              onClick={() => pick(item.kingWenNumber)}
            >
              <MiniHexagram lines={staticLines(item)} />
              <span className="grid-text">
                <b>{item.name}</b>
                <span>{item.fullName}</span>
              </span>
              <i>{item.kingWenNumber}</i>
            </button>
          ))}
          {!list.length && <p className="hint">没有匹配的卦。</p>}
        </div>
      </section>

      {hexagram && result && (
        <>
          <HexagramBoard hexagram={hexagram} lines={staticLines(hexagram)} />
          <section className="card">
            <h3>卦辞</h3>
            <p className="judgement">{contentByNumber(hexagram.kingWenNumber).judgementText}</p>
            <p className="plain">{contentByNumber(hexagram.kingWenNumber).divinationText}</p>
          </section>
          <section className="card">
            <h3>爻辞</h3>
            <ol className="line-texts">
              {staticLines(hexagram).map((_, i) => (
                <li key={i}>
                  <span className="line-title">{lineTitle(hexagram, i)}</span>
                  <span className="line-body">{contentByNumber(hexagram.kingWenNumber).lineTexts[i]}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="card facts">
            <div>
              <span>宫位</span>
              <b>
                {palaceRankLabel(hexagram)} · {hexagram.palace}
              </b>
            </div>
            <div>
              <span>错卦</span>
              <b>{opposite(hexagram)?.fullName}</b>
            </div>
            <div>
              <span>综卦</span>
              <b>{inverse(hexagram)?.fullName}</b>
            </div>
            <div>
              <span>互卦</span>
              <b>{mutual(hexagram).fullName}</b>
            </div>
            <div>
              <span>上下卦</span>
              <b>
                {symbol(upper(hexagram))} {trigramName(upper(hexagram))} / {symbol(lower(hexagram))}{' '}
                {trigramName(lower(hexagram))}
              </b>
            </div>
          </section>

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
        </>
      )}
    </div>
  )
}
