/** @typedef {import('./types.js').LineType} LineType */
import { TRIGRAM_MASK, trigramFromFuxi } from './trigram.js'
import { hexagramWithLines } from './hexagramData.js'
import { castResult } from './castResult.js'

const BRANCHES = { 子: 1, 丑: 2, 寅: 3, 卯: 4, 辰: 5, 巳: 6, 午: 7, 未: 8, 申: 9, 酉: 10, 戌: 11, 亥: 12 }

/** @param {string} name 地支名 */
export const branchOrder = (name) => BRANCHES[/** @type {keyof typeof BRANCHES} */ (name)] ?? 0

/** 余数与先天数互转（0 → 8）。 @param {number} remainder */
export const fuxiNumberFromRemainder = (remainder) => {
  const r = ((remainder % 8) + 8) % 8
  return r === 0 ? 8 : r
}

/** 动爻（0–5，0 = 初爻）。 @param {number} remainder */
export const movingLineFromRemainder = (remainder) => {
  const r = ((remainder % 6) + 6) % 6
  return r === 0 ? 5 : r - 1
}

/** @param {number} fuxiNumber @returns {number} 三爻掩码 */
const maskFromFuxi = (fuxiNumber) => {
  const t = trigramFromFuxi(fuxiNumber)
  return t ? TRIGRAM_MASK[t.kind] : 0
}

/** 依主卦与动爻生成六爻序列（动爻为老，其余为少）。 @param {import('./types.js').Hexagram} hexagram @param {number} moving */
const sixLines = (hexagram, moving) => {
  /** @type {LineType[]} */
  const lines = []
  for (let i = 0; i < 6; i += 1) {
    const yang = ((hexagram.lines >> i) & 1) === 1
    if (i === moving) lines.push(yang ? 9 : 6)
    else lines.push(yang ? 7 : 8)
  }
  return lines
}

/** @param {number} upperFuxi @param {number} lowerFuxi */
const bitsFrom = (upperFuxi, lowerFuxi) => (maskFromFuxi(upperFuxi) << 3) | maskFromFuxi(lowerFuxi)

/**
 * 时间起卦：上卦 = (年支序 + 月 + 日) % 8；下卦、动爻加入时辰支序。
 * @param {number} yearBranchOrder @param {number} month 农历月 @param {number} day 农历日 @param {number} hourBranchOrder
 */
export const castByTime = (yearBranchOrder, month, day, hourBranchOrder) => {
  const base = yearBranchOrder + month + day
  const total = base + hourBranchOrder
  const original = hexagramWithLines(bitsFrom(fuxiNumberFromRemainder(base), fuxiNumberFromRemainder(total)))
  return castResult('plumTime', sixLines(original, movingLineFromRemainder(total)))
}

/**
 * 报数起卦：两数分别取上下卦；动爻取 (数一 + 数二 + 时辰支序) % 6。
 * @param {number} num1 @param {number} num2 @param {number} hourBranchOrder
 */
export const castByNumbers = (num1, num2, hourBranchOrder = 0) => {
  const original = hexagramWithLines(bitsFrom(fuxiNumberFromRemainder(num1), fuxiNumberFromRemainder(num2)))
  return castResult('plumNumbers', sixLines(original, movingLineFromRemainder(num1 + num2 + hourBranchOrder)))
}

/** 闭区间随机整数（可注入以便测试）。 @param {number} min @param {number} max */
const defaultRandomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))

/**
 * 随机起卦。
 * @param {(min:number,max:number)=>number} [randomInt] 闭区间
 */
export const castRandom = (randomInt = defaultRandomInt) => {
  const upperNum = randomInt(1, 8)
  const lowerNum = randomInt(1, 8)
  const moving = randomInt(0, 5)
  return castResult('plumRandom', sixLines(hexagramWithLines(bitsFrom(upperNum, lowerNum)), moving))
}
