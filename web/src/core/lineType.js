/** @typedef {import('./types.js').LineType} LineType */

export const OLD_YIN = /** @type {const} */ (6)
export const YOUNG_YANG = /** @type {const} */ (7)
export const YOUNG_YIN = /** @type {const} */ (8)
export const OLD_YANG = /** @type {const} */ (9)

/** 数值采用传统五行策数：6 老阴、7 少阳、8 少阴、9 老阳。 */
const NAME = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' }

/** @param {LineType} line */
export const isYang = (line) => line === YOUNG_YANG || line === OLD_YANG

/** 是否为动爻（老阴 / 老阳）。 @param {LineType} line */
export const isMoving = (line) => line === OLD_YIN || line === OLD_YANG

/** 动爻变化后的爻（老阴→少阳，老阳→少阴；静爻保持原样）。 @param {LineType} line */
export const changed = (line) => {
  if (line === OLD_YIN) return YOUNG_YANG
  if (line === OLD_YANG) return YOUNG_YIN
  return line
}

/** @param {LineType} line */
export const name = (line) => NAME[line]

/** 爻名（老阳→"九"）。 @param {LineType} line */
export const lineName = (line) => (isYang(line) ? '九' : '六')

/** 爻符展示（爻辞栏用）。 @param {LineType} line */
export const lineSymbol = (line) => {
  if (line === OLD_YIN) return '老阴 ✕'
  if (line === YOUNG_YANG) return '少阳 ─'
  if (line === YOUNG_YIN) return '少阴 ─ ─'
  return '老阳 ○'
}

export const LINE_TYPES = /** @type {LineType[]} */ ([6, 7, 8, 9])

/** 线下排卦「可设动爻」时点击爻位的四态循环：少阴 → 少阳 → 老阴 → 老阳 → 少阴。 @param {LineType} line */
export const nextLineType = (line) => {
  if (line === YOUNG_YIN) return YOUNG_YANG
  if (line === YOUNG_YANG) return OLD_YIN
  if (line === OLD_YIN) return OLD_YANG
  return YOUNG_YIN
}

/** 把动爻降级为同阴阳的静爻（老阳→少阳、老阴→少阴），静爻原样。 @param {LineType} line */
export const downgradeLine = (line) => {
  if (line === OLD_YANG) return YOUNG_YANG
  if (line === OLD_YIN) return YOUNG_YIN
  return line
}

/**
 * 由静态卦象推出六爻（无动爻）。bit i = 第 i 爻（0 = 初爻）。
 * @param {{ lines: number }} hexagram
 * @returns {LineType[]}
 */
export const staticLines = (hexagram) =>
  Array.from({ length: 6 }, (_, i) => (((hexagram.lines >> i) & 1) === 1 ? YOUNG_YANG : YOUNG_YIN))

/** 爻位名，索引与六爻数组一致（0 = 初爻，5 = 上爻）。 */
export const LINE_POSITIONS = /** @type {const} */ (['初', '二', '三', '四', '五', '上'])

/** 自上而下展示的爻行（上爻在最上），label 与 idx 严格对应，避免标错爻位。 */
export const lineRows = () =>
  /** @type {{label: string, idx: number}[]} */ (
    [5, 4, 3, 2, 1, 0].map((idx) => ({ label: /** @type {string} */ (LINE_POSITIONS[idx]), idx }))
  )
