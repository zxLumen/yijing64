/** @typedef {import('./types.js').TrigramKind} TrigramKind */
/** @typedef {import('./types.js').Trigram} Trigram */

export const TRIGRAM_MASK = {
  kun: 0b000,
  zhen: 0b001,
  kan: 0b010,
  dui: 0b011,
  gen: 0b100,
  li: 0b101,
  xun: 0b110,
  qian: 0b111,
}

/** 掩码 → 卦kind（索引即掩码，与 TRIGRAM_MASK 互逆）。 */
const MASK_TO_KIND = /** @type {const} */ (['kun', 'zhen', 'kan', 'dui', 'gen', 'li', 'xun', 'qian'])

/** 先天卦数（乾一 兑二 离三 震四 巽五 坎六 艮七 坤八）。 */
const FUXI_TO_KIND = /** @type {const} */ ({ 1: 'qian', 2: 'dui', 3: 'li', 4: 'zhen', 5: 'xun', 6: 'kan', 7: 'gen', 8: 'kun' })

const NAME = { qian: '乾', dui: '兑', li: '离', zhen: '震', xun: '巽', kan: '坎', gen: '艮', kun: '坤' }
const NATURE = { qian: '天', dui: '泽', li: '火', zhen: '雷', xun: '风', kan: '水', gen: '山', kun: '地' }
const SYMBOL = { qian: '☰', dui: '☱', li: '☲', zhen: '☳', xun: '☴', kan: '☵', gen: '☶', kun: '☷' }
const ELEMENT = { qian: '金', dui: '金', li: '火', zhen: '木', xun: '木', kan: '水', gen: '土', kun: '土' }

/** @param {TrigramKind} kind */
export const trigram = (kind) => ({ kind })

/** @param {number} fuxiNumber */
export const trigramFromFuxi = (fuxiNumber) => {
  const kind = FUXI_TO_KIND[/** @type {keyof typeof FUXI_TO_KIND} */ (fuxiNumber)]
  return kind ? trigram(kind) : null
}

/** @param {number} mask 三爻掩码 0..7 */
export const trigramFromMask = (mask) => trigram(MASK_TO_KIND[mask & 0b111] ?? 'qian')

/** @param {Trigram} t */
export const name = (t) => NAME[t.kind]

/** 自然象征（天泽火雷风水山地）。 @param {Trigram} t */
export const nature = (t) => NATURE[t.kind]

/** @param {Trigram} t */
export const symbol = (t) => SYMBOL[t.kind]

/** @param {Trigram} t */
export const element = (t) => ELEMENT[t.kind]

/** 三爻阴阳，自下而上。 @param {Trigram} t @param {number} index */
export const lineIsYang = (t, index) => ((TRIGRAM_MASK[t.kind] >> index) & 1) === 1

export const TRIGRAM_KINDS = /** @type {TrigramKind[]} */ ([...MASK_TO_KIND].reverse())
