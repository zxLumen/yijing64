import type { ReactNode } from 'react'
import type { CastResult, LineType } from '../core/types.js'
import { HexagramTrio } from './HexagramBoard.js'
import { bodyUse, movingLines, movingLineTitles } from '../core/castResult.js'
import { contentByNumber } from '../core/hexagramData.js'
import { lineTitle } from '../core/hexagram.js'
import { symbol, name as trigramName } from '../core/trigram.js'
import { label as methodLabel } from '../core/castMethod.js'

const POSITION = ['初', '二', '三', '四', '五', '上']

/**
 * 起卦结果详情：三联卦象 + 卦辞爻辞 + 体用。AI 对话区由调用方通过 children 注入。
 */
export default function CastResultView({
  result,
  lines,
  onOpen,
  children,
}: {
  result: CastResult
  lines?: LineType[]
  /** 点击本/互/变卦 → 在卦库打开对应卦（可选） */
  onOpen?: (kingWenNumber: number) => void
  children?: ReactNode
}) {
  const shown = lines ?? result.originalLines
  const content = contentByNumber(result.original.kingWenNumber)
  const moving = movingLines(result)
  const movingSet = new Set(moving)
  const changedContent = contentByNumber(result.changed.kingWenNumber)
  const bu = bodyUse(result)

  return (
    <div className="result">
      <p className="result-method">{methodLabel(result.method)}</p>

      <HexagramTrio
        original={result.original}
        changed={result.changed}
        mutual={result.mutual}
        lines={shown}
        onOpen={onOpen}
      />

      <section className="card">
        <h3>卦辞</h3>
        <p className="judgement">{content.judgementText}</p>
        {content.extraLine && <p className="extra">用事：{content.extraLine}</p>}
        <p className="plain">{content.divinationText}</p>
      </section>

      <section className="card">
        <h3>爻辞</h3>
        <ol className="line-texts">
          {shown.map((line, i) => (
            <li key={i} data-moving={movingSet.has(i) || undefined}>
              <span className="line-title">
                {lineTitle(result.original, i)}
                {movingSet.has(i) && <b className="tag">动</b>}
              </span>
              <span className="line-body">{content.lineTexts[i]}</span>
              {movingSet.has(i) && (
                <span className="line-changed">
                  之 {lineTitle(result.changed, i)}：{changedContent.lineTexts[i]}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="card facts">
        <div>
          <span>动爻</span>
          <b>{moving.length ? movingLineTitles(result).join('、') : '无（静卦）'}</b>
        </div>
        {bu && (
          <div>
            <span>体 / 用</span>
            <b>
              体 {symbol(bu.body)} {trigramName(bu.body)} · 用 {symbol(bu.use)} {trigramName(bu.use)}
            </b>
          </div>
        )}
        <div>
          <span>变卦</span>
          <b>
            {result.changed.fullName}
            {moving.length === 0 && '（与本卦相同）'}
          </b>
        </div>
      </section>

      {children}
    </div>
  )
}

export { POSITION }
