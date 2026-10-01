import test from 'node:test'
import assert from 'node:assert/strict'

import { trigramFromFuxi, symbol } from '../src/core/trigram.js'
import {
  branchOrder,
  fuxiNumberFromRemainder,
  movingLineFromRemainder,
  castByTime,
  castByNumbers,
  castRandom,
} from '../src/core/plumBlossomCaster.js'
import { hexagramWithLines } from '../src/core/hexagramData.js'
import { upper, lower } from '../src/core/hexagram.js'
import { movingLines, movingLineTitles, bodyUse } from '../src/core/castResult.js'
import { isYang } from '../src/core/lineType.js'

test('先天卦数映射', () => {
  assert.equal(trigramFromFuxi(1)?.kind, 'qian')
  assert.equal(trigramFromFuxi(2)?.kind, 'dui')
  assert.equal(trigramFromFuxi(8)?.kind, 'kun')
  assert.equal(trigramFromFuxi(0), null)
  assert.equal(trigramFromFuxi(9), null)
})

test('地支序数', () => {
  assert.equal(branchOrder('子'), 1)
  assert.equal(branchOrder('午'), 7)
  assert.equal(branchOrder('亥'), 12)
  assert.equal(branchOrder('x'), 0)
})

test('余数与动爻换算', () => {
  assert.equal(fuxiNumberFromRemainder(0), 8)
  assert.equal(fuxiNumberFromRemainder(1), 1)
  assert.equal(fuxiNumberFromRemainder(9), 1)
  assert.equal(movingLineFromRemainder(0), 5)
  assert.equal(movingLineFromRemainder(1), 0)
  assert.equal(movingLineFromRemainder(4), 3)
  assert.equal(movingLineFromRemainder(6), 5)
})

test('已知时间起卦：寅年三月十一日丑时 → 天火同人，初爻动变天山遁', () => {
  const result = castByTime(3, 3, 11, 2)
  assert.equal(symbol(upper(result.original)), '☰')
  assert.equal(symbol(lower(result.original)), '☲')
  assert.equal(result.original.kingWenNumber, 13)
  assert.deepEqual(movingLineTitles(result), ['初九'])
  assert.equal(result.changed.kingWenNumber, 33)
})

test('已知报数起卦：7 与 6 → 山水蒙，初爻动', () => {
  const result = castByNumbers(7, 6, 0)
  assert.equal(symbol(upper(result.original)), '☶')
  assert.equal(symbol(lower(result.original)), '☵')
  assert.equal(result.original.kingWenNumber, 4)
  assert.deepEqual(movingLineTitles(result), ['初六'])
  assert.ok(result.changed.kingWenNumber >= 1 && result.changed.kingWenNumber <= 64)
})

test('体用由动爻所在之卦推出', () => {
  const result = castByTime(3, 3, 11, 2)
  const bu = bodyUse(result)
  assert.ok(bu)
  assert.equal(symbol(bu.body), '☰')
  assert.equal(symbol(bu.use), '☲')
})

test('随机起卦恰一爻动且有体用', () => {
  const result = castRandom((min, max) => min + Math.floor(Math.random() * (max - min + 1)))
  assert.equal(result.method, 'plumRandom')
  assert.ok(result.original.kingWenNumber >= 1 && result.original.kingWenNumber <= 64)
  assert.equal(movingLines(result).length, 1)
  assert.ok(bodyUse(result))
})

test('六爻序列重新推出的本卦与结果一致', () => {
  const result = castRandom((min, max) => min + Math.floor(Math.random() * (max - min + 1)))
  let bits = 0
  result.originalLines.forEach((line, i) => {
    if (isYang(line)) bits |= 1 << i
  })
  assert.equal(hexagramWithLines(bits).kingWenNumber, result.original.kingWenNumber)
})
