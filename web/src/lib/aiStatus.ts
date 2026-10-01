/**
 * 站点 AI 状态协议:把本应用的 AI 活动报给嵌入它的博客,那儿的导航栏有一盏
 * 三色状态灯(协议见博客仓库 docs/AI-STATUS.md)。不进 iframe 时静默跳过。
 *
 * 目标 origin 取自 document.referrer —— 跨源时默认 referrer 策略只透出 origin,
 * 正好够用。取不到就**不报**,绝不退回 '*':那等于把状态广播给任意嵌入页。
 */
export const HOST_ORIGIN = (() => {
  if (typeof document === 'undefined') return ''
  try {
    return document.referrer ? new URL(document.referrer).origin : ''
  } catch {
    return ''
  }
})()

export type ReportableAiState = 'idle' | 'thinking' | 'working' | 'success' | 'error' | 'blocked'

/** 不在被 iframe 嵌入时(独立打开/本机开发)直接空转。 */
export const reportAiState = (state: ReportableAiState, detail?: string) => {
  if (!HOST_ORIGIN || window.parent === window) return
  try {
    window.parent.postMessage({ type: 'zx:ai-status', app: 'yijing', state, detail }, HOST_ORIGIN)
  } catch {
    /* 嵌入页已卸载:忽略 */
  }
}
