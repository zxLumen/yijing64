import type { LineType } from '../core/types.js'
import { isYang, isMoving } from '../core/lineType.js'

type Variant = 'detail' | 'compact'

/**
 * 单根爻线：阳爻一横、阴爻两断，固定宽度（CSS 变量 --glyph-w）居中。
 * 老阳 / 老阴为动爻，线条用强调色并带 ○ / ✕ 圆点徽标（不遮挡爻名）。
 */
export function LineGlyph({
  line,
  variant = 'detail',
  showMark = true,
}: {
  line: LineType
  variant?: Variant
  showMark?: boolean
}) {
  const yang = isYang(line)
  const moving = isMoving(line)
  return (
    <span className="hex-line" data-variant={variant} data-moving={moving || undefined}>
      <span className="hex-line-bars">
        {yang ? (
          <i />
        ) : (
          <>
            <i />
            <i />
          </>
        )}
      </span>
      {showMark && moving && <em className="hex-line-mark">{line === 9 ? '○' : '✕'}</em>}
    </span>
  )
}

/** 迷你六爻图（卦库网格用），上爻在最上。 */
export function MiniHexagram({ lines }: { lines: LineType[] }) {
  return (
    <span className="mini-hexagram" aria-hidden="true">
      {[5, 4, 3, 2, 1, 0].map((i) => {
        const yang = isYang(lines[i] ?? 7)
        return (
          <span key={i} className="mini-line">
            {yang ? (
              <i />
            ) : (
              <>
                <i />
                <i />
              </>
            )}
          </span>
        )
      })}
    </span>
  )
}
