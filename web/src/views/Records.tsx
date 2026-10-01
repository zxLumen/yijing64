import { useState } from 'react'
import type { CastRecord, CastResult } from '../core/types.js'
import { castResult, movingLines } from '../core/castResult.js'
import { label as methodLabel } from '../core/castMethod.js'
import CastResultView from '../components/CastResultView.js'
import ChatStream from '../components/ChatStream.js'
import { useInterpretation } from '../lib/useInterpretation.js'
import { fmtCNY, fmtDate, fmtTokens, summarizeUsage } from '../lib/format.js'
import { clearRecords, deleteRecord, type SessionInfo } from '../lib/api.js'

type Props = {
  records: CastRecord[]
  session: SessionInfo
  readonly: boolean
  onChanged: () => void
  onOpenHexagram?: (kingWenNumber: number) => void
}

const rebuild = (record: CastRecord): CastResult => castResult(record.method, record.originalLines)

export default function RecordsView({ records, session, readonly, onChanged, onOpenHexagram }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const chat = useInterpretation(() => onChanged())

  const open = records.find((r) => r.id === openId) ?? null
  const usage = summarizeUsage(records)
  const aiDisabled = !session.hasAi || readonly
  const aiHint = readonly
    ? '正在查看访客的数据，只读。'
    : session.hasAi
      ? ''
      : session.visitorAi
        ? '站长尚未配置 API Key，暂不能解读。'
        : '站长暂未开放访客使用 AI。'

  const openDetail = (record: CastRecord) => {
    setOpenId(record.id)
    setError('')
    chat.load(record)
  }

  const closeDetail = () => {
    setOpenId(null)
    chat.load(null)
  }

  const remove = async (id: string) => {
    setError('')
    try {
      await deleteRecord(id)
      if (openId === id) closeDetail()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败。')
    }
  }

  const removeAll = async () => {
    if (!confirm('确定清空全部起卦记录？此操作不可撤销。')) return
    setError('')
    try {
      await clearRecords()
      closeDetail()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空失败。')
    }
  }

  if (open) {
    const result = rebuild(open)
    return (
      <div className="view">
        <div className="actions">
          <button type="button" className="ghost" onClick={closeDetail}>
            ← 返回列表
          </button>
          <span className="hint">{fmtDate(open.date)}</span>
        </div>
        <CastResultView result={result} lines={open.originalLines} onOpen={onOpenHexagram}>
          <section className="card">
            <h3>AI 解卦</h3>
            <ChatStream
              transcript={chat.transcript}
              streaming={chat.streaming}
              error={chat.error}
              usage={chat.usage ?? open.aiUsage}
              disabled={aiDisabled}
              disabledHint={aiHint}
              question={chat.question}
              onQuestionChange={chat.setQuestion}
              onAsk={() => chat.ask(result, open)}
              onStop={chat.stop}
            />
          </section>
          <div className="actions">
            <button type="button" className="ghost danger" onClick={() => remove(open.id)} disabled={readonly}>
              删除这条记录
            </button>
          </div>
        </CastResultView>
      </div>
    )
  }

  return (
    <div className="view">
      <section className="card usage">
        <h3>Token 用量</h3>
        <div className="usage-grid">
          <div>
            <span>已解读</span>
            <b>{usage.requestCount}</b>
          </div>
          <div>
            <span>输入</span>
            <b>{fmtTokens(usage.promptTokens)}</b>
          </div>
          <div>
            <span>输出</span>
            <b>{fmtTokens(usage.completionTokens)}</b>
          </div>
          <div>
            <span>合计</span>
            <b>{fmtTokens(usage.totalTokens)}</b>
          </div>
          <div>
            <span>缓存命中</span>
            <b>{fmtTokens(usage.cacheHitTokens)}</b>
          </div>
          <div>
            <span>预估费用</span>
            <b>{fmtCNY(usage.estimatedCostCNY)}</b>
          </div>
        </div>
        {usage.byModel.length > 0 && (
          <p className="hint">
            按模型：
            {usage.byModel.map((item) => `${item.model} ×${item.count}（${fmtTokens(item.usage.totalTokens)}）`).join('、')}
          </p>
        )}
      </section>

      {error && <p className="chat-error">{error}</p>}

      <section className="card">
        <div className="list-head">
          <h3>起卦记录（{records.length}）</h3>
          {!readonly && records.length > 0 && (
            <button type="button" className="link danger" onClick={removeAll}>
              清空全部
            </button>
          )}
        </div>

        {!records.length && <p className="hint">还没有记录。去「起卦」页掷一卦吧。</p>}

        <ul className="record-list">
          {records.map((record) => {
            const result = rebuild(record)
            const moving = movingLines(result).length
            return (
              <li key={record.id}>
                <button type="button" className="record" onClick={() => openDetail(record)}>
                  <span className="record-main">
                    <b>{result.original.fullName}</b>
                    <i>
                      {methodLabel(record.method)} · {fmtDate(record.date)}
                      {moving ? ` · ${moving} 爻动` : ' · 静卦'}
                      {record.aiAnswer ? ' · 已解读' : ''}
                    </i>
                    {record.question && <em>{record.question}</em>}
                  </span>
                  {!readonly && (
                    <span
                      className="record-del"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation()
                        void remove(record.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation()
                          void remove(record.id)
                        }
                      }}
                    >
                      删除
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
