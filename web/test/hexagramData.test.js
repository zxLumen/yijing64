import test from 'node:test'
import assert from 'node:assert/strict'

import { ALL, allByNumber, findByNumber, hexagramWithLines, contentByNumber, palaceRankLabel } from '../src/core/hexagramData.js'
import { trigram, trigramFromFuxi, symbol, nature, element, name } from '../src/core/trigram.js'
import { upper, lower, opposite, inverse, mutual, lineTitle } from '../src/core/hexagram.js'
import { search } from '../src/core/hexagramSearch.js'

test('六十四卦齐备', () => {
  assert.equal(ALL.length, 64)
  const numbers = allByNumber().map((h) => h.kingWenNumber)
  assert.equal(new Set(numbers).size, 64)
  assert.deepEqual([...numbers].sort((a, b) => a - b), Array.from({ length: 64 }, (_, i) => i + 1))
})

test('六爻掩码互异', () => {
  assert.equal(new Set(ALL.map((h) => h.lines)).size, 64)
})

test('八宫序：每宫 8 卦，宫内为本宫/一世…归魂', () => {
  /** @type {Record<string, string[]>} */
  const byPalace = {}
  for (const h of ALL) (byPalace[h.palace] ??= []).push(palaceRankLabel(h))
  for (const [palace, ranks] of Object.entries(byPalace)) {
    assert.equal(ranks.length, 8, `${palace} 应有 8 卦`)
    assert.deepEqual(ranks, ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'], palace)
  }
})

test('上下卦拆解（已知卦例）', () => {
  const qian = findByNumber(1)
  assert.equal(qian.lines, 0b111111)
  assert.equal(symbol(upper(qian)), '☰')
  assert.equal(symbol(lower(qian)), '☰')

  const kun = findByNumber(2)
  assert.equal(kun.lines, 0)
  assert.equal(symbol(upper(kun)), '☷')

  assert.equal(symbol(upper(findByNumber(3))), '☵')
  assert.equal(symbol(lower(findByNumber(3))), '☳')

  assert.equal(symbol(upper(findByNumber(49))), '☱')
  assert.equal(symbol(lower(findByNumber(49))), '☲')
})

test('按掩码查表可往返', () => {
  for (const hexagram of ALL) assert.strictEqual(hexagramWithLines(hexagram.lines), hexagram)
})

test('错卦 / 综卦 / 互卦', () => {
  assert.strictEqual(opposite(findByNumber(1)), findByNumber(2))
  assert.strictEqual(inverse(findByNumber(1)), findByNumber(1))
  assert.strictEqual(mutual(findByNumber(1)), findByNumber(1))
  assert.strictEqual(mutual(findByNumber(2)), findByNumber(2))
  // 泰（地天泰）互卦 = 雷泽归妹；否（天地否）互卦 = 风山渐
  assert.strictEqual(mutual(findByNumber(11)), findByNumber(54))
  assert.strictEqual(mutual(findByNumber(12)), findByNumber(53))
  assert.strictEqual(inverse(findByNumber(11)), findByNumber(12))
  assert.strictEqual(inverse(mutual(findByNumber(11))), mutual(findByNumber(12)))
})

test('爻名', () => {
  assert.equal(lineTitle(findByNumber(1), 0), '初九')
  assert.equal(lineTitle(findByNumber(1), 5), '上九')
  assert.equal(lineTitle(findByNumber(2), 1), '六二')
  assert.equal(lineTitle(findByNumber(2), 5), '上六')
})

test('经卦属性', () => {
  const qian = trigram('qian')
  assert.equal(symbol(qian), '☰')
  assert.equal(nature(qian), '天')
  assert.equal(element(qian), '金')
  const dui = trigramFromFuxi(2)
  assert.equal(symbol(dui), '☱')
  assert.equal(name(dui), '兑')
  assert.equal(trigramFromFuxi(0), null)
  assert.equal(trigramFromFuxi(9), null)
})

test('六十四卦辞文完整', () => {
  for (let number = 1; number <= 64; number += 1) {
    const c = contentByNumber(number)
    assert.ok(c.judgementText.trim().length > 0, `卦辞缺失：${number}`)
    assert.equal(c.lineTexts.length, 6)
    for (const line of c.lineTexts) assert.ok(line.trim().length > 0, `爻辞缺失：${number}`)
    assert.ok(c.divinationText.trim().length > 0, `白话缺失：${number}`)
  }
})

test('已知卦辞文本', () => {
  const qian = contentByNumber(1)
  assert.equal(qian.judgementText, '元亨。利贞')
  assert.equal(qian.lineTexts[0], '潜龙勿用。')
  assert.equal(qian.extraLine, '见群龙无首，吉。')
  assert.ok(qian.divinationText.includes('《乾卦》象征天'))

  assert.equal(contentByNumber(2).extraLine, '利永贞。')

  const weiji = contentByNumber(64)
  assert.equal(weiji.judgementText, '亨。小狐汔济，濡其尾，无攸利')
  assert.ok(weiji.divinationText.includes('《未济卦》象征事未完成'))
})

test('卦库搜索：卦名 / 全名 / 卦序 / 卦辞', () => {
  const byName = search('乾').map((h) => h.kingWenNumber)
  assert.ok(byName.includes(1))
  assert.ok(byName.includes(44))

  assert.deepEqual(search('天泽履').map((h) => h.kingWenNumber), [10])
  assert.deepEqual(search('13').map((h) => h.kingWenNumber), [13])

  const prefix = search('1').map((h) => h.kingWenNumber)
  assert.ok(prefix.includes(1))
  assert.ok(prefix.includes(10))

  assert.ok(search('潜龙勿用').map((h) => h.kingWenNumber).includes(1))
  assert.equal(search('').length, 64)
  assert.equal(search('   ').length, 64)
  assert.deepEqual(search('不存在的卦'), [])
})
