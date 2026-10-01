/** @typedef {import('./types.js').LineType} LineType */
import { OLD_YIN, YOUNG_YANG, YOUNG_YIN, OLD_YANG } from './lineType.js'
import { castResult } from './castResult.js'

/**
 * 抛掷一次三枚铜钱：true 为正面。
 * @param {boolean} coin1 @param {boolean} coin2 @param {boolean} coin3
 */
export const lineTypeFromCoins = (coin1, coin2, coin3) => {
  const heads = [coin1, coin2, coin3].filter(Boolean).length
  if (heads === 0) return OLD_YIN
  if (heads === 1) return YOUNG_YANG
  if (heads === 2) return YOUNG_YIN
  return OLD_YANG
}

/**
 * 连抛 6 次，自下而上生成一卦。
 * 六爻在调用瞬间一次性生成，揭示动画只负责逐个展示，与随机源解耦。
 * @param {() => boolean} [throwCoin]
 */
export const castCoins = (throwCoin = () => Math.random() < 0.5) => {
  /** @type {LineType[]} */
  const lines = []
  for (let i = 0; i < 6; i += 1) lines.push(lineTypeFromCoins(throwCoin(), throwCoin(), throwCoin()))
  return castResult('threeCoins', lines)
}
