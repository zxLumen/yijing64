import type { Hexagram, LineType } from '../core/types.js'
import { isYang, name as lineTypeName, staticLines, LINE_POSITIONS } from '../core/lineType.js'
import { lineTitle } from '../core/hexagram.js'
import { upper, lower } from '../core/hexagram.js'
import { symbol, name as trigramName } from '../core/trigram.js'
import { palaceRankLabel } from '../core/hexagramData.js'
import { LineGlyph } from './HexagramLine.js'

/** 单根爻：爻名 + 爻线 + 爻型。 */
function Line({ line, label }: { line: LineType; label: string }) {
  return (
    <div className="line-row">
      <span className="line-label">{label}</span>
      <LineGlyph line={line} />
      <span className="line-type">{lineTypeName(line)}</span>
    </div>
  )
}

type Props = {
  hexagram: Hexagram
  /** 起卦得到的六爻（含老阴老阳）；查卦/无起卦过程时省略 */
  lines?: LineType[]
  /** 是否显示上爻在最上的完整六爻 */
  full?: boolean
  compact?: boolean
}

/**
 * 卦象图：卦名 + 上下卦 + 六爻。上爻在上（与纸质卦辞同序）。
 */
export default function HexagramBoard({ hexagram, lines, full = true, compact = false }: Props) {
  const shown = lines ?? staticLines(hexagram)
  const order = [5, 4, 3, 2, 1, 0]

  return (
    <div className="hexagram" data-compact={compact || undefined}>
      <div className="hexagram-head">
        <div>
          <strong className="hexagram-name">{hexagram.name}</strong>
          <span className="hexagram-full">{hexagram.fullName}</span>
        </div>
        <div className="hexagram-meta">
          <span>第 {hexagram.kingWenNumber} 卦</span>
          <span>
            {symbol(upper(hexagram))} {trigramName(upper(hexagram))}上 / {symbol(lower(hexagram))}{' '}
            {trigramName(lower(hexagram))}下
          </span>
          <span>{palaceRankLabel(hexagram)}</span>
        </div>
      </div>

      {full && (
        <div className="hexagram-lines">
          {order.map((i) => (
            <Line key={i} line={shown[i] ?? 7} label={`${LINE_POSITIONS[i]}${isYang(shown[i] ?? 7) ? '九' : '六'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

export { lineTitle }

/** 三联：本卦 / 互卦 / 变卦 —— 起卦结果的标准排版。 */
export function HexagramTrio({
  original,
  changed,
  mutual,
  lines,
}: {
  original: Hexagram
  changed: Hexagram
  mutual: Hexagram
  lines?: LineType[]
}) {
  return (
    <div className="hexagram-trio">
      <div>
        <span className="trio-tag">本卦</span>
        <HexagramBoard hexagram={original} lines={lines} />
      </div>
      <div>
        <span className="trio-tag">互卦</span>
        <HexagramBoard hexagram={mutual} compact />
      </div>
      <div>
        <span className="trio-tag">变卦</span>
        <HexagramBoard hexagram={changed} compact />
      </div>
    </div>
  )
}
