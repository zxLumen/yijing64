import test from 'node:test'
import assert from 'node:assert/strict'

import { lunarOf, yearBranchOrder, hourBranchOrder, timeCastInputs } from '../src/core/lunar.js'
import { isRelevant, REFUSAL } from '../src/core/divinationTopic.js'
import { buildConversation, messages, isDefaultReading } from '../src/core/hexagramInterpretation.js'
import { castByTime, castByNumbers } from '../src/core/plumBlossomCaster.js'
import { castResult } from '../src/core/castResult.js'

const BEIJING_OFFSET_MIN = 8 * 60
/** 以东八区构造时间，避免测试机时区影响。 */
const at = (y, m, d, hh = 8, mm = 30) => new Date(Date.UTC(y, m - 1, d, hh, mm) - BEIJING_OFFSET_MIN * 60_000)

test('年支序：干支年（春节界）为准，1984 甲子为子', () => {
  assert.equal(yearBranchOrder(2024), 5)
  assert.equal(yearBranchOrder(2025), 6)
  assert.equal(yearBranchOrder(2026), 7)
  assert.equal(yearBranchOrder(1984), 1)
  assert.equal(yearBranchOrder(1985), 2)
})

test('农历换算：春节前仍属上一干支年', () => {
  const before = lunarOf(at(2026, 1, 15))
  assert.equal(before.year, 2025)
  assert.equal(before.month, 11)
  assert.equal(before.day, 27)
  assert.equal(before.isLeapMonth, false)

  const after = lunarOf(at(2026, 2, 20))
  assert.equal(after.year, 2026)
  assert.equal(after.month, 1)
})

test('农历换算：闰月标记为 bis，取其月号', () => {
  const leap = lunarOf(at(2025, 8, 5))
  assert.equal(leap.isLeapMonth, true)
  assert.equal(leap.month, 6)
})

test('时辰支序：子时跨 23:00–01:00', () => {
  assert.equal(hourBranchOrder(at(2026, 1, 15, 0)), 1)
  assert.equal(hourBranchOrder(at(2026, 1, 15, 1)), 1)
  assert.equal(hourBranchOrder(at(2026, 1, 15, 23)), 1)
  assert.equal(hourBranchOrder(at(2026, 1, 15, 2)), 2)
  assert.equal(hourBranchOrder(at(2026, 1, 15, 12)), 7)
})

test('时间起卦输入：年支序来自干支年而非公历年', () => {
  const inputs = timeCastInputs(at(2026, 1, 15))
  assert.equal(inputs.year, 2025)
  assert.equal(inputs.yearBranchOrder, 6)
  assert.equal(inputs.hourBranchOrder, 5)
  assert.equal(typeof inputs.month, 'number')
  assert.equal(typeof inputs.day, 'number')
})

test('2026-01-15 的时间起卦可复算（对照公历年算法的旧偏差）', () => {
  const inputs = timeCastInputs(at(2026, 1, 15))
  const result = castByTime(inputs.yearBranchOrder, inputs.month, inputs.day, inputs.hourBranchOrder)
  assert.equal(result.method, 'plumTime')
  assert.ok(result.original.kingWenNumber >= 1 && result.original.kingWenNumber <= 64)
  assert.equal(result.originalLines.filter((l) => l === 6 || l === 9).length, 1)
})

test('占卜话题闸门：默认放行，仅拦客观事实/实时信息', () => {
  assert.equal(isRelevant(''), true)
  assert.equal(isRelevant('今天天气怎么样'), false)
  assert.equal(isRelevant('现在几点了'), false)
  assert.equal(isRelevant('今天的新闻'), false)
  // 同时命中占卜词时放行
  assert.equal(isRelevant('占卜天气出行'), true)
  // 模糊表述默认放行
  assert.equal(isRelevant('这几天写代码合适吗'), true)
  assert.equal(isRelevant('能出门吗'), true)
  assert.ok(REFUSAL.includes('占卜'))
})

test('静卦上下文：只有本卦，无动爻 / 互卦 / 变卦', () => {
  const result = castResult('threeCoins', [7, 7, 7, 7, 7, 8])
  const [system, user] = messages(result, '')
  assert.equal(system.role, 'system')
  assert.ok(user.content.includes('本次起卦方式：三枚铜钱'))
  assert.ok(user.content.includes('本卦：'))
  assert.ok(user.content.includes('卦辞：'))
  assert.ok(user.content.includes('动爻：无（静卦，以本卦卦辞为主）'))
  assert.ok(!user.content.includes('互卦：'))
  assert.ok(!user.content.includes('变卦：'))
  assert.ok(user.content.endsWith('请解读以上卦象。'))
})

test('有动爻的上下文：列动爻爻辞，互卦与变卦仅在与本卦不同时出现', () => {
  const result = castByTime(3, 3, 11, 2)
  const [, user] = messages(result, '')
  assert.ok(user.content.includes('动爻：初九'))
  assert.ok(user.content.includes('- 初九：'))
  assert.ok(user.content.includes('互卦：'))
  assert.ok(user.content.includes('变卦：天山遁'))
  assert.ok(!user.content.includes('变卦：天火同人'))
})

test('空白提问 = 默认解卦：只看卦象，丢弃全部历史', () => {
  const result = castByNumbers(7, 6, 0)
  const history = [
    { id: 'a', role: 'user', content: '上一轮问题' },
    { id: 'b', role: 'assistant', content: '上一轮回答', reasoning: '' },
  ]
  const blank = buildConversation(result, '   ', history)
  assert.equal(blank.length, 2)
  assert.equal(blank[0].role, 'system')
  assert.ok(!blank[1].content.includes('上一轮问题'))

  const asked = buildConversation(result, '这件事如何', history)
  assert.equal(asked.length, 5)
  assert.equal(asked[1].role, 'user')
  assert.equal(asked[2].content, '上一轮问题')
  assert.equal(asked[4].content, '这件事如何')
  assert.ok(isDefaultReading('  '))
  assert.ok(!isDefaultReading('运势'))
})

test('线下排卦的爻行：自上而下展示，爻位名与下标严格对应', async () => {
  const { lineRows, LINE_POSITIONS, YOUNG_YANG, YOUNG_YIN } = await import('../src/core/lineType.js')
  const { findByNumber } = await import('../src/core/hexagramData.js')

  // 上爻在顶，但 label 必须跟着 idx 走（初爻 = 下标 0）
  assert.deepEqual(lineRows(), [
    { label: '上', idx: 5 },
    { label: '五', idx: 4 },
    { label: '四', idx: 3 },
    { label: '三', idx: 2 },
    { label: '二', idx: 1 },
    { label: '初', idx: 0 },
  ])
  assert.deepEqual([...LINE_POSITIONS], ['初', '二', '三', '四', '五', '上'])

  // 姤（巽下乾上）：初六为阴、上九为阳，行内取值须与卦序一致
  const gou = findByNumber(44)
  const lines = []
  for (let i = 0; i < 6; i += 1) lines.push(((gou.lines >> i) & 1 ? YOUNG_YANG : YOUNG_YIN))
  const shown = Object.fromEntries(lineRows().map(({ label, idx }) => [label, lines[idx]]))
  assert.equal(shown['初'], YOUNG_YIN)
  assert.equal(shown['上'], YOUNG_YANG)
})
