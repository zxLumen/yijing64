import test from 'node:test'
import assert from 'node:assert/strict'

import { lineTypeFromCoins, castCoins } from '../src/core/coinCaster.js'
import { movingLines } from '../src/core/castResult.js'

test('三枚铜钱 → 四态爻型', () => {
  assert.equal(lineTypeFromCoins(true, true, true), 9)
  assert.equal(lineTypeFromCoins(true, true, false), 8)
  assert.equal(lineTypeFromCoins(true, false, false), 7)
  assert.equal(lineTypeFromCoins(false, false, false), 6)
})

test('连抛六次产出合法卦象', () => {
  const result = castCoins()
  assert.equal(result.originalLines.length, 6)
  assert.ok(result.original.kingWenNumber >= 1 && result.original.kingWenNumber <= 64)
  assert.ok(result.changed.kingWenNumber >= 1 && result.changed.kingWenNumber <= 64)
  assert.ok(movingLines(result).length <= 6)
  assert.ok(result.mutual.kingWenNumber >= 1)
})

test('确定性抛掷：六爻皆老阳 → 乾，六爻皆动，变坤', () => {
  const queue = Array.from({ length: 18 }, () => true)
  const result = castCoins(() => queue.shift())
  assert.equal(result.original.kingWenNumber, 1)
  assert.deepEqual(result.originalLines, [9, 9, 9, 9, 9, 9])
  assert.deepEqual(movingLines(result), [0, 1, 2, 3, 4, 5])
  assert.equal(result.changed.kingWenNumber, 2)
})

test('大量抛掷的分布：老阴阳各 1/8，少阴阳各 3/8', () => {
  const total = 40000
  /** @type {Record<number, number>} */
  const counters = {}
  for (let i = 0; i < total; i += 1) {
    const line = lineTypeFromCoins(Math.random() < 0.5, Math.random() < 0.5, Math.random() < 0.5)
    counters[line] = (counters[line] ?? 0) + 1
  }
  const ratio = (line) => (counters[line] ?? 0) / total
  assert.ok(Math.abs(ratio(6) - 0.125) < 0.05, `老阴 ${ratio(6)}`)
  assert.ok(Math.abs(ratio(9) - 0.125) < 0.05, `老阳 ${ratio(9)}`)
  assert.ok(Math.abs(ratio(8) - 0.375) < 0.05, `少阴 ${ratio(8)}`)
  assert.ok(Math.abs(ratio(7) - 0.375) < 0.05, `少阳 ${ratio(7)}`)
})
