/** @typedef {import('./types.js').CastMethod} CastMethod */

const LABEL = {
  manual: '线下·手动排卦',
  threeCoins: '三枚铜钱',
  plumTime: '梅花·时间起卦',
  plumNumbers: '梅花·报数起卦',
  plumRandom: '梅花·随机起卦',
  hexagramLibrary: '卦库·单卦解读',
}

const SUBTITLE = {
  manual: '点击设置六爻 · 录入线下摇卦结果',
  threeCoins: '六爻摇钱法 · 抛掷六次',
  plumTime: '以农历时间取上下卦与动爻',
  plumNumbers: '以两个数字取卦',
  plumRandom: '梅花易数 · 随机取卦',
  hexagramLibrary: '卦库单卦的直接解读',
}

/** 可用于「起卦」页选择的方式（排除手动录入与卦库解读）。 */
export const CASTABLE_METHODS = /** @type {CastMethod[]} */ (['threeCoins', 'plumTime', 'plumNumbers', 'plumRandom'])

/** @param {CastMethod} method */
export const label = (method) => LABEL[method]

/** @param {CastMethod} method */
export const subtitle = (method) => SUBTITLE[method]

/** @param {unknown} value */
export const isCastMethod = (value) => typeof value === 'string' && value in LABEL
