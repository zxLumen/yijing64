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
