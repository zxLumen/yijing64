/** @typedef {import('./types.js').Hexagram} Hexagram */
/** @typedef {import('./types.js').Trigram} Trigram */
import { trigramFromMask, name as trigramName, nature as trigramNature, symbol as trigramSymbol } from './trigram.js'
import { findWithLines, hexagramWithLines } from './hexagramData.js'

const POSITIONS = ['初', '二', '三', '四', '五', '上']

/** 上卦。 @param {Hexagram} hexagram */
export const upper = (hexagram) => /** @type {Trigram} */ (trigramFromMask((hexagram.lines >> 3) & 0b111))

/** 下卦。 @param {Hexagram} hexagram */
export const lower = (hexagram) => /** @type {Trigram} */ (trigramFromMask(hexagram.lines & 0b111))

/** @param {Hexagram} hexagram */
export const guaImage = (hexagram) => trigramSymbol(upper(hexagram)) + trigramSymbol(lower(hexagram))

/** @param {Hexagram} hexagram @param {number} index 自下而上，0 = 初爻。 */
export const lineIsYang = (hexagram, index) => ((hexagram.lines >> index) & 1) === 1

/** 某爻的爻名，如 "初九" "六二"。 @param {Hexagram} hexagram @param {number} index */
export const lineTitle = (hexagram, index) => {
  const yao = lineIsYang(hexagram, index) ? '九' : '六'
  if (index === 0) return `初${yao}`
  if (index === 5) return `上${yao}`
  return yao + POSITIONS[index]
}

/** 错卦（对宫阴阳全变）。 @param {Hexagram} hexagram */
export const opposite = (hexagram) => /** @type {Hexagram} */ (findWithLines(~hexagram.lines))

/** 综卦（倒置 / 反象）。 @param {Hexagram} hexagram */
export const inverse = (hexagram) => {
  let reversed = 0
  for (let i = 0; i < 6; i += 1) {
    if (lineIsYang(hexagram, i)) reversed |= 1 << (5 - i)
  }
  return /** @type {Hexagram} */ (findWithLines(reversed))
}

/** 互卦：二至五爻，二三四爻为下卦，三四五爻为上卦。 @param {number} lines */
export const mutualLines = (lines) => {
  let result = 0
  for (let i = 0; i < 3; i += 1) {
    if (((lines >> (i + 1)) & 1) === 1) result |= 1 << i
  }
  for (let i = 0; i < 3; i += 1) {
    if (((lines >> (i + 2)) & 1) === 1) result |= 1 << (i + 3)
  }
  return result
}

/** @param {Hexagram} hexagram */
export const mutual = (hexagram) => hexagramWithLines(mutualLines(hexagram.lines))

/** 上卦自然 + 下卦自然，如 "天上地下"。 @param {Hexagram} hexagram */
export const naturePair = (hexagram) => `${trigramNature(upper(hexagram))}上${trigramNature(lower(hexagram))}下`

/** 卦库列表行副标题，如 "天上地下 · 乾卦"。 @param {Hexagram} hexagram */
export const listSubtitle = (hexagram) => `${naturePair(hexagram)} · ${trigramName(upper(hexagram))}卦`
