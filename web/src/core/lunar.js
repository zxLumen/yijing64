/** 地支序数：子=1 丑=2 … 亥=12（年支序同此表）。 */
const HOUR_BRANCH_ORDER = [1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 1]

const CHINESE = new Intl.DateTimeFormat('en-u-ca-chinese', { year: 'numeric', month: 'numeric', day: 'numeric' })

/**
 * 农历日期。走 ICU 的中国农历（与 Foundation `Calendar(identifier: .chinese)` 同源），
 * 不引第三方依赖；年份以春节为界（梅花易数传统用法）。
 * @param {Date} [date]
 */
export const lunarOf = (date = new Date()) => {
  const parts = CHINESE.formatToParts(date)
  /** @param {string} type */
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? ''
  const rawMonth = pick('month').replace(/bis$/, '')
  const year = Number(pick('relatedYear'))
  const month = Number(rawMonth)
  const day = Number(pick('day'))
  return {
    year: Number.isFinite(year) ? year : date.getFullYear(),
    month: Number.isFinite(month) && month > 0 ? month : 1,
    day: Number.isFinite(day) && day > 0 ? day : 1,
    isLeapMonth: /bis$/.test(pick('month')),
  }
}

/**
 * 年支序数（地支序）。以干支年（春节界）为准：1984 甲子 = 子 = 1。
 * 原生 App 误用公历年 `(year - 4) % 12`，既差干支年界、甲子年又得 0，网页版修正。
 * @param {number} ganzhiYear
 */
export const yearBranchOrder = (ganzhiYear) => (((ganzhiYear - 1984) % 12) + 12) % 12 + 1

/** 时辰支序（子时跨 23:00–01:00）。 @param {Date} [date] */
export const hourBranchOrder = (date = new Date()) => HOUR_BRANCH_ORDER[date.getHours()]

/**
 * 时间起卦所需的四项输入。 @param {Date} [date]
 */
export const timeCastInputs = (date = new Date()) => {
  const lunar = lunarOf(date)
  return {
    year: lunar.year,
    month: lunar.month,
    day: lunar.day,
    isLeapMonth: lunar.isLeapMonth,
    yearBranchOrder: yearBranchOrder(lunar.year),
    hourBranchOrder: hourBranchOrder(date),
  }
}

/** 干支四柱（年/月/日 + 时支），仅用于界面展示。 @param {Date} [date] */
export const pillarsOf = (date = new Date()) => {
  const parts = CHINESE.formatToParts(date)
  /** @param {string} type */
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: pick('yearName') || pick('relatedYear'),
    month: pick('monthName') || `${pick('month')}`,
    day: pick('dayName') || `${pick('day')}`,
    hour: HOUR_BRANCH_ORDER[date.getHours()],
  }
}
