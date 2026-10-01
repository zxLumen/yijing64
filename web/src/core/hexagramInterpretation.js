/** @typedef {import('./types.js').CastResult} CastResult */
/** @typedef {import('./types.js').DialogueTurn} DialogueTurn */
/** @typedef {{role:'system'|'user'|'assistant',content:string}} ChatMessage */
import { content } from './hexagramData.js'
import { lineTitle, upper, lower } from './hexagram.js'
import { nature as trigramNature } from './trigram.js'
import { isMoving } from './lineType.js'
import { label as methodLabel } from './castMethod.js'

export const SYSTEM_PROMPT = `你是一位精通《周易》与现代白话解卦的资深命理师。请以务实、直率、就事论事的中文白话解读卦象，对吉凶给出明确判断，不回避、不软化。
输出格式（必须严格遵守）：
- 使用 Markdown 分节标题（## 标题）与列表（- 每条一到两句话）；
- 恰好四个分节：「整体卦象」「动爻解读」（无动爻则改为「静卦说明」）「变卦启示」「给你的建议」；
- 「整体卦象」的第 1 条必须先针对用户所问之事给出明确判词（如：可行／不可行、宜／不宜、吉／凶、能成／难成、可以／不建议），再展开依据；
- 全文控制在 200-500 字，每节 2-5 条要点；
- 不要输出引言、结语、或“以下是/总结”等客套话；
- 全程使用中文，包括思考过程与最终回答；除专有名词、代码外不要夹用英文；
- 将用户问题视为对所问之事的吉凶征询：凡关乎切身选择与利弊的问题，无论句式多朴素，都应结合本卦象解读——例如能不能出门、远行适不适合、要不要跳槽换工作、感情能否发展、考试能否通过、合作生意能否谈成、是否适合置业或投资、身体能否康复等；
- 以“能不能/合适吗/顺利吗/要不要/哪天”询问某个具体活动（写代码、健身、上课、出差、复习、运动等）的时机吉凶时，视为对该活动占问吉凶，按卦解读，不要当作知识求助拒绝；
- 如实判卦，不迎合：卦辞或爻辞出现「凶、吝、厉、悔、咎、无攸利、勿用、弗克、征凶」等，或动爻、变卦明显趋坏时，必须直接判为不利／不宜／难成，并说明原因与规避建议；
- 禁止把不利弱化为折中说法，例如“适量”“适度”“短途可以”“不远行就行”“注意一点就好”“勉强可行”“虽然……但也不是不行”“看个人努力”“凡事皆有两面”；卦象不利就明确说不宜，不要为了让用户好受而含糊；
- 若卦象确有转机或并非全凶，必须写明需要满足的具体条件，而不是笼统安慰；
- 直言吉凶但不恐吓、不夸大、不宿命，语气客观平和，强调“参考与启发”，避免堆砌古文术语；
- 仅当用户是请求完成某件与命理无关的任务、或询问客观事实/实时信息/无关知识时（如“帮我写一首诗”“这道数学题怎么做”“这段英文帮我翻译”、或“今天几号”“现在几点”“天气怎样”“谁当选总统”），才回复一句简短拒绝，如“这与占卜无关，请告诉我你想占卜的事情”；拒绝时禁止引用卦象，禁止生成任何卦象解读，也禁止在拒绝后回到卦象话题。`

/** 卦象上下文（system 之后的固定首条 user）。 @param {CastResult} result */
const buildContext = (result) => {
  const original = result.original
  const lines = []
  lines.push(`本次起卦方式：${methodLabel(result.method)}`)
  lines.push(`本卦：${original.fullName}（第${original.kingWenNumber}卦，${trigramNature(upper(original))}上${trigramNature(lower(original))}下）`)

  const c = content(original)
  if (c.judgementText) lines.push(`卦辞：${c.judgementText}`)

  const moving = result.originalLines.flatMap((line, i) => (isMoving(line) ? [i] : []))
  if (moving.length === 0) {
    lines.push('动爻：无（静卦，以本卦卦辞为主）')
  } else {
    lines.push(`动爻：${moving.map((i) => lineTitle(original, i)).join('、')}`)
    for (const index of moving) lines.push(`- ${lineTitle(original, index)}：${c.lineTexts[index] ?? ''}`)
    if (result.mutual.kingWenNumber !== original.kingWenNumber) {
      lines.push(`互卦：${result.mutual.fullName}（${result.mutual.kingWenNumber}）`)
    }
    if (result.changed.kingWenNumber !== original.kingWenNumber) {
      const changedText = content(result.changed)
      const suffix = changedText.judgementText ? `，卦辞“${changedText.judgementText}”` : ''
      lines.push(`变卦：${result.changed.fullName}（${result.changed.kingWenNumber}）${suffix}`)
    }
  }
  return lines.join('\n')
}

/** @param {CastResult} result @param {string} question */
const buildUserTurn = (result, question) => {
  let user = buildContext(result)
  if (question) user += `\n\n【所问之事】\n${question}`
  return `${user}\n\n请解读以上卦象。`
}

/** 单轮便捷入口。 @param {CastResult} result @param {string} question @returns {ChatMessage[]} */
export const messages = (result, question) => {
  const trimmed = question.trim()
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserTurn(result, trimmed) },
  ]
}

/**
 * 完整对话序列：system + 卦象上下文始终在首，随后按历史追加 user/assistant，
 * 最后追加本轮提问。空白提问（默认解卦）严格只看卦象，忽略全部历史。
 * @param {CastResult} result @param {string} question @param {DialogueTurn[]} history @returns {ChatMessage[]}
 */
export const buildConversation = (result, question, history) => {
  const trimmed = question.trim()
  if (!trimmed) return messages(result, '')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildContext(result) },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: trimmed },
  ]
}

/** 空白提问 = 默认解卦：关闭思考过程并压低输出预算。 @param {string} question */
export const isDefaultReading = (question) => question.trim().length === 0
