/** @typedef {import('./types.js').CastResult} CastResult */
/** @typedef {import('./types.js').CastMethod} CastMethod */
/** @typedef {import('./types.js').LineType} LineType */
/** @typedef {import('./types.js').BodyUse} BodyUse */
import { isYang, isMoving } from './lineType.js'
import { hexagramWithLines } from './hexagramData.js'
import { lineTitle, mutualLines, upper, lower } from './hexagram.js'

/** 由起卦方式与六爻推导本卦 / 变卦 / 互卦。 @param {CastMethod} method @param {LineType[]} originalLines */
export const castResult = (method, originalLines) => {
  let originalBits = 0
  let changedBits = 0
  originalLines.forEach((line, i) => {
    if (isYang(line)) originalBits |= 1 << i
    if (isMoving(line)) changedBits |= 1 << i
  })
  changedBits ^= originalBits
  return {
    method,
    originalLines,
    original: hexagramWithLines(originalBits),
    changed: hexagramWithLines(changedBits),
    mutual: hexagramWithLines(mutualLines(originalBits)),
  }
}

/** 动爻（自下而上，0 = 初爻）。 @param {CastResult} result */
export const movingLines = (result) => result.originalLines.flatMap((line, i) => (isMoving(line) ? [i] : []))

/** 动爻名称，如 ["初九"]。 @param {CastResult} result */
export const movingLineTitles = (result) => movingLines(result).map((i) => lineTitle(result.original, i))

/** 恰好一个动爻时的体卦 / 用卦；用卦为动爻所在之卦。 @param {CastResult} result */
export const bodyUse = (result) => {
  const moving = movingLines(result)
  if (moving.length !== 1) return null
  return moving[0] < 3 ? { body: upper(result.original), use: lower(result.original) } : { body: lower(result.original), use: upper(result.original) }
}

/** 由卦象静态六爻（无动爻）构造结果，供卦库单卦解读。 @param {CastMethod} method @param {import('./types.js').Hexagram} hexagram */
export const fromHexagram = (method, hexagram) => {
  /** @type {LineType[]} */
  const lines = []
  for (let i = 0; i < 6; i += 1) lines.push(((hexagram.lines >> i) & 1) === 1 ? 7 : 8)
  return castResult(method, lines)
}
