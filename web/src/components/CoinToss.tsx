import { useEffect, useState } from 'react'
import type { LineType } from '../core/types.js'
import { name as lineTypeName } from '../core/lineType.js'

/** 每爻揭示间隔；与产品决策一致（420ms/爻，自初爻至上爻）。 */
export const REVEAL_MS = 420

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * 逐爻揭示：点击瞬间一次性生成六爻，动画只负责「逐条显示」。
 * @returns 本次起卦的六爻（未起卦为 null）
 */
export function useLineReveal() {
  const [lines, setLines] = useState<LineType[] | null>(null)
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    if (!lines || revealed >= lines.length) return
    if (prefersReducedMotion()) {
      setRevealed(lines.length)
      return
    }
    const timer = setTimeout(() => setRevealed((n) => n + 1), REVEAL_MS)
    return () => clearTimeout(timer)
  }, [lines, revealed])

  const start = (next: LineType[]) => {
    setLines(next)
    setRevealed(prefersReducedMotion() ? next.length : 0)
  }
  const skip = () => setRevealed(lines?.length ?? 0)
  const reset = () => {
    setLines(null)
    setRevealed(0)
  }

  return {
    lines,
    revealed,
    revealing: !!lines && revealed < lines.length,
    start,
    skip,
    reset,
  }
}

/** 由爻型反推一组「示意」铜钱正反面（概率对称，取最简组合）。 */
const facesFor = (line: LineType): ('back' | 'front')[] => {
  if (line === 9) return ['back', 'back', 'back']
  if (line === 8) return ['front', 'front', 'back']
  if (line === 7) return ['back', 'front', 'front']
  return ['front', 'front', 'front']
}

const COIN_LABEL = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

type Props = {
  lines: LineType[] | null
  revealed: number
  revealing: boolean
  onSkip: () => void
}

/**
 * 铜钱逐爻揭示：三枚铜钱 → 一爻，自下而上依次点亮。
 */
export default function CoinToss({ lines, revealed, revealing, onSkip }: Props) {
  if (!lines) return null
  const visible = lines.slice(0, revealed)
  const pending = lines.length - revealed

  return (
    <div className="coin-toss" aria-live="polite">
      <div className="coin-lines">
        {COIN_LABEL.map((label, i) => {
          const line = visible[i]
          return (
            <div key={label} className="coin-line" data-shown={line !== undefined || undefined}>
              <span className="coin-line-label">{label}</span>
              {line === undefined ? (
                <span className="coin-line-empty">待揭示</span>
              ) : (
                <span className="coin-coins">
                  {facesFor(line).map((face, j) => (
                    <i key={j} className="coin" data-face={face}>
                      {face === 'back' ? '背' : '字'}
                    </i>
                  ))}
                  <b>{lineTypeName(line)}</b>
                </span>
              )}
            </div>
          )
        })}
      </div>
      {revealing && (
        <div className="coin-progress">
          <span>
            正在揭示，还剩 {pending} 爻
          </span>
          <button type="button" className="link" onClick={onSkip}>
            跳过动画
          </button>
        </div>
      )}
    </div>
  )
}
