/** @typedef {import('./types.js').Hexagram} Hexagram */
import { ALL, content } from './hexagramData.js'
import { name as trigramName, nature as trigramNature } from './trigram.js'
import { name as palaceName } from './palace.js'
import { upper, lower } from './hexagram.js'

const NUMERIC = /^[0-9]+$/

/** 命中判定：卦名、全名、宫名、上下卦名与其自然、卦辞、爻辞与白话译文。 @param {Hexagram} hexagram @param {string} query */
const matches = (hexagram, query) => {
  if (NUMERIC.test(query)) {
    const number = Number(query)
    if (number > 0 && number <= 64) {
      const numStr = String(hexagram.kingWenNumber)
      if (hexagram.kingWenNumber === number || numStr.startsWith(query)) return true
      if (numStr.includes(query)) return true
    }
  }

  const c = content(hexagram)
  const haystacks = [
    hexagram.name,
    hexagram.fullName,
    palaceName(hexagram.palace),
    trigramName(upper(hexagram)),
    trigramNature(upper(hexagram)),
    trigramName(lower(hexagram)),
    trigramNature(lower(hexagram)),
    c.judgementText,
    c.divinationText,
    ...c.lineTexts,
  ]
  if (c.extraLine) haystacks.push(c.extraLine)

  const needle = query.toLowerCase()
  return haystacks.some((s) => s.toLowerCase().includes(needle))
}

/** 按关键词搜索，返回按文王卦序排列的结果。 @param {string} query @param {Hexagram[]} [allHexagrams] */
export const search = (query, allHexagrams = ALL) => {
  const trimmed = query.trim()
  if (!trimmed) return allHexagrams
  return allHexagrams.filter((h) => matches(h, trimmed)).sort((a, b) => a.kingWenNumber - b.kingWenNumber)
}

/** 结果按八宫重新分组（空宫略过），保持宫序。 @param {Hexagram[]} results */
export const groupByPalace = (results) => {
  /** @type {Map<string, Hexagram[]>} */
  const groups = new Map()
  for (const h of results) {
    const list = groups.get(h.palace) ?? []
    list.push(h)
    groups.set(h.palace, list)
  }
  return [...groups.entries()].map(([palace, items]) => ({ palace, items }))
}

/**
 * 命中位置（用于列表行高亮）：返回文本中首个命中片段，未命中为 null。
 * @param {string} text @param {string} query
 * @returns {{start:number,end:number}|null}
 */
export const matchRange = (text, query) => {
  if (!query) return null
  const start = text.toLowerCase().indexOf(query.toLowerCase())
  return start < 0 ? null : { start, end: start + query.length }
}
