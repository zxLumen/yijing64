/** @typedef {import('./types.js').Hexagram} Hexagram */
/** @typedef {import('./types.js').HexagramContent} HexagramContent */
/** @typedef {import('./types.js').Palace} Palace */
import rawHexagrams from '../data/hexagrams.json' with { type: 'json' }
import rawContents from '../data/contents.json' with { type: 'json' }
import { PALACE_ORDER } from './palace.js'

const PLACEHOLDER_CONTENT = {
  judgementText: '[卦辞待补充]',
  lineTexts: ['[爻辞待补充]', '[爻辞待补充]', '[爻辞待补充]', '[爻辞待补充]', '[爻辞待补充]', '[爻辞待补充]'],
  divinationText: '[白话解读待补充]',
  extraLine: null,
}

/**
 * 八宫序：本宫 / 一世…五世 / 游魂 / 归魂，相对本宫卦的异或掩码。
 * 世爻自初爻起逐爻变，游魂复第四爻，归魂再复下卦。
 */
const PALACE_RANK_XOR = [0, 0b000001, 0b000011, 0b000111, 0b001111, 0b011111, 0b010111, 0b010000]
const PALACE_RANK_LABEL = ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂']

/** 各宫本宫卦的六爻掩码 = 该宫三爻掩码置于高低位各一次（mask * 0b1001）。 */
const PALACE_BASE = { qian: 63, dui: 27, li: 45, zhen: 9, xun: 54, kan: 18, gen: 36, kun: 0 }

const ALL_BY_NUMBER = /** @type {Hexagram[]} */ (
  rawHexagrams.map((r) => ({
    kingWenNumber: r.number,
    name: r.name,
    fullName: r.fullName,
    lines: r.lines,
    palace: /** @type {Palace} */ (r.palace),
  }))
)

const BY_NUMBER = new Map(ALL_BY_NUMBER.map((h) => [h.kingWenNumber, h]))
const BY_LINES = new Map(ALL_BY_NUMBER.map((h) => [h.lines, h]))

const PALACE_INDEX = new Map(PALACE_ORDER.map((p, i) => [p, i]))

/** @param {Hexagram} hexagram 宫内序位，0 = 本宫。 */
export const palaceRank = (hexagram) => {
  const base = PALACE_BASE[hexagram.palace]
  const rank = PALACE_RANK_XOR.findIndex((xor) => (base ^ xor) === hexagram.lines)
  return rank < 0 ? 0 : rank
}

/** @param {Hexagram} hexagram */
export const palaceRankLabel = (hexagram) => PALACE_RANK_LABEL[palaceRank(hexagram)]

/** 卦库展示序：按八宫（乾兑离震巽坎艮坤）分组，宫内按本宫/一世…归魂。 */
export const ALL = [...ALL_BY_NUMBER].sort((a, b) => {
  const pa = PALACE_INDEX.get(a.palace) ?? 0
  const pb = PALACE_INDEX.get(b.palace) ?? 0
  return pa !== pb ? pa - pb : palaceRank(a) - palaceRank(b)
})

/** 按文王卦序排列的全部卦。 */
export const allByNumber = () => ALL_BY_NUMBER

/** @param {number} number @returns {Hexagram | undefined} */
export const findByNumber = (number) => BY_NUMBER.get(number)

/** @param {number} lines @returns {Hexagram | undefined} */
export const findWithLines = (lines) => BY_LINES.get(lines & 0b111111)

/** @param {number} lines @returns {Hexagram} */
export const hexagramWithLines = (lines) => {
  const found = findWithLines(lines)
  if (!found) throw new Error(`六爻掩码无对应卦: ${lines & 0b111111}`)
  return found
}

/** @param {number} number @returns {HexagramContent} */
export const contentByNumber = (number) => {
  const item = rawContents[number - 1]
  if (!item || (!item.judgementText && item.lineTexts.every((t) => !t))) return PLACEHOLDER_CONTENT
  return {
    judgementText: item.judgementText,
    lineTexts: item.lineTexts,
    divinationText: item.divinationText,
    extraLine: item.extraLine || null,
  }
}

/** @param {Hexagram} hexagram @returns {HexagramContent} */
export const content = (hexagram) => contentByNumber(hexagram.kingWenNumber)
