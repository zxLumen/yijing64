import { useMemo, useState } from 'react'
import type { CastMethod, CastRecord, CastResult } from '../core/types.js'
import { CASTABLE_METHODS, label as methodLabel, subtitle } from '../core/castMethod.js'
import { castCoins } from '../core/coinCaster.js'
import { castByNumbers, castByTime, castRandom } from '../core/plumBlossomCaster.js'
import { pillarsOf, timeCastInputs } from '../core/lunar.js'
import CastResultView from '../components/CastResultView.js'
import CoinToss, { useLineReveal } from '../components/CoinToss.js'
import ChatStream from '../components/ChatStream.js'
import { useInterpretation } from '../lib/useInterpretation.js'
import { newId, saveRecord, type SessionInfo } from '../lib/api.js'

const newRecord = (result: CastResult): CastRecord => ({
  id: newId(),
  date: new Date().toISOString(),
  method: result.method,
  originalLines: result.originalLines,
  question: '',
  aiAnswer: '',
  transcript: [],
  aiUsage: null,
  model: null,
  provider: null,
})

type Props = {
  session: SessionInfo
  onSaved: (record: CastRecord) => void
}

export default function CastView({ session, onSaved }: Props) {
  const [method, setMethod] = useState<CastMethod>('threeCoins')
  const [result, setResult] = useState<CastResult | null>(null)
  const [numberA, setNumberA] = useState('')
  const [numberB, setNumberB] = useState('')
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const reveal = useLineReveal()
  const chat = useInterpretation(onSaved)

  const inputs = useMemo(() => (method === 'plumTime' ? timeCastInputs(new Date()) : null), [method])
  const pillars = useMemo(() => (method === 'plumTime' ? pillarsOf(new Date()) : null), [method])

  // 起卦方式变化时清掉上一次结果
  const pick = (next: CastMethod) => {
    setMethod(next)
    setResult(null)
    setError('')
    setSavedId(null)
    reveal.reset()
    chat.load(null)
  }

  const accept = (next: CastResult, animate = false) => {
    setResult(next)
    setError('')
    setSavedId(null)
    chat.load(null)
    if (animate) reveal.start(next.originalLines)
    else reveal.reset()
  }

  const cast = () => {
    setError('')
    try {
      if (method === 'threeCoins') {
        accept(castCoins(), true)
        return
      }
      if (method === 'plumRandom') {
        accept(castRandom())
        return
      }
      if (method === 'plumTime') {
        const now = timeCastInputs(new Date())
        accept(castByTime(now.yearBranchOrder, now.month, now.day, now.hourBranchOrder))
        return
      }
      // 报数起卦：留空或 0 表示随机
      const a = Number(numberA)
      const b = Number(numberB)
      if ((numberA.trim() && !Number.isInteger(a)) || (numberB.trim() && !Number.isInteger(b))) {
        setError('请输入整数（留空表示随机）。')
        return
      }
      accept(castByNumbers(a > 0 ? a : 0, b > 0 ? b : 0, 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : '起卦失败。')
    }
  }

  const ready = !!result && !reveal.revealing
  // 记录对象只随本次卦象生成一次：AI 自动落库与手动保存必须复用同一个 id
  const record = useMemo<CastRecord | null>(
    () => (result ? { ...newRecord(result), model: session.model, provider: session.provider } : null),
    [result, session.model, session.provider],
  )
  const saved = !!record && savedId === record.id

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
  const aiHint = session.hasAi
    ? ''
    : session.visitorAi
      ? '站长尚未配置 API Key，暂不能解读。'
      : '站长暂未开放访客使用 AI。'

  return (
    <div className="view">
      <section className="card">
        <div className="method-tabs">
          {CASTABLE_METHODS.map((item) => (
            <button
              key={item}
              type="button"
              className={item === method ? 'active' : ''}
              onClick={() => pick(item)}
              title={subtitle(item)}
            >
              {methodLabel(item)}
            </button>
          ))}
        </div>
        <p className="hint">{subtitle(method)}</p>

        {method === 'plumNumbers' && (
          <div className="field-row">
            <label>
              第一个数
              <input
                type="number"
                inputMode="numeric"
                value={numberA}
                placeholder="随机"
                onChange={(e) => setNumberA(e.target.value)}
              />
            </label>
            <label>
              第二个数
              <input
                type="number"
                inputMode="numeric"
                value={numberB}
                placeholder="随机"
                onChange={(e) => setNumberB(e.target.value)}
              />
            </label>
          </div>
        )}

        {inputs && pillars && (
          <p className="hint pillars">
            干支 {pillars.year}年 {pillars.month}月 {pillars.day}日 {pillars.hour}时
            {inputs.isLeapMonth ? '（闰月，取本月月号）' : ''} · 上元 {inputs.year} · 年支序 {inputs.yearBranchOrder} · 月{' '}
            {inputs.month} · 日 {inputs.day} · 时支序 {inputs.hourBranchOrder}
          </p>
        )}

        <button type="button" className="primary" onClick={cast} disabled={method === 'threeCoins' && reveal.revealing}>
          {method === 'threeCoins' ? '掷铜钱起卦' : '起卦'}
        </button>
        {error && <p className="chat-error">{error}</p>}
      </section>

      {!result && !reveal.lines && <p className="idle-hint">✦ 选定方式后点「起卦」</p>}

      {method === 'threeCoins' && reveal.lines && (
        <CoinToss lines={reveal.lines} revealed={reveal.revealed} revealing={reveal.revealing} onSkip={reveal.skip} />
      )}

      {result && !ready && (
        <p className="casting">
          <span className="spinner" aria-hidden="true" />
          起卦中…
        </p>
      )}

      {result && ready && (
        <CastResultView result={result} lines={reveal.lines ?? result.originalLines}>
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
          </div>
        </CastResultView>
      )}
    </div>
  )
}
