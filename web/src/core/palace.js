/** @typedef {import('./types.js').Palace} Palace */
/** @typedef {import('./types.js').Trigram} Trigram */
import { trigram, symbol, element } from './trigram.js'

/** 展示与分组顺序：乾兑离震巽坎艮坤。 */
export const PALACE_ORDER = /** @type {Palace[]} */ (['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'])

const NAME = { qian: '乾宫', dui: '兑宫', li: '离宫', zhen: '震宫', xun: '巽宫', kan: '坎宫', gen: '艮宫', kun: '坤宫' }

/** 宫之经卦（Palace 枚举值即三爻掩码，与 TrigramKind 同名同值）。 @param {Palace} palace */
export const palaceTrigram = (palace) => trigram(/** @type {any} */ (palace))

/** @param {Palace} palace */
export const name = (palace) => NAME[palace]

/** @param {Palace} palace */
export const symbolOf = (palace) => symbol(palaceTrigram(palace))

/** @param {Palace} palace */
export const elementOf = (palace) => element(palaceTrigram(palace))

/** @param {Palace} palace */
export const symbolAndElement = (palace) => `${symbolOf(palace)} ${name(palace)}属${elementOf(palace)}`
