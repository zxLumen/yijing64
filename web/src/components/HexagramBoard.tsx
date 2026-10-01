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
}

/**
 * 卦象图：卦名 + 上下卦 + 六爻。上爻在上（与纸质卦辞同序）。
 */
export default function HexagramBoard({ hexagram, lines, full = true }: Props) {
  const shown = lines ?? staticLines(hexagram)
  const order = [5, 4, 3, 2, 1, 0]

  return (
    <div className="hexagram">
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
  onOpen,
}: {
  original: Hexagram
  changed: Hexagram
  mutual: Hexagram
  lines?: LineType[]
  /** 点击三联中的卦 → 在卦库打开对应卦（可选） */
  onOpen?: (kingWenNumber: number) => void
}) {
  const cell = (tag: string, hexagram: Hexagram, cellLines?: LineType[]) => {
    const open = onOpen ? () => onOpen(hexagram.kingWenNumber) : undefined
    return (
      <div
        className="trio-cell"
        data-clickable={onOpen ? true : undefined}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        title={onOpen ? `在卦库查看「${hexagram.fullName}」` : undefined}
        onClick={open}
        onKeyDown={
          open
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  open()
                }
              }
            : undefined
        }
      >
        <span className="trio-tag">{tag}</span>
        <HexagramBoard hexagram={hexagram} lines={cellLines} />
      </div>
    )
  }

  return (
    <div className="hexagram-trio">
      {cell('本卦', original, lines)}
      {cell('互卦', mutual)}
      {cell('变卦', changed)}
    </div>
  )
}
