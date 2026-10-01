import test from 'node:test'
import assert from 'node:assert/strict'

import { endpointURL, friendlyDetail, modelsURL, parseChunk, requestBody, standardHeaders } from '../lib/llm.js'

test('端点构造容错结尾斜杠', () => {
  assert.equal(endpointURL('https://api.deepseek.com')?.toString(), 'https://api.deepseek.com/chat/completions')
  assert.equal(endpointURL('https://api.deepseek.com/')?.toString(), 'https://api.deepseek.com/chat/completions')
  assert.equal(
    endpointURL('https://open.bigmodel.cn/api/paas/v4')?.toString(),
    'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  )
  assert.equal(modelsURL('https://api.deepseek.com/v1')?.toString(), 'https://api.deepseek.com/v1/models')
  assert.equal(endpointURL(''), null)
  assert.equal(endpointURL('   '), null)
  assert.equal(modelsURL('not a url'), null)
})

test('请求头：opencode 网关必须带会话头', () => {
  assert.deepEqual(standardHeaders({ apiKey: '', baseURL: 'https://api.deepseek.com' }, 'sid'), {
    'Content-Type': 'application/json',
    'User-Agent': 'Yijing64/1.0',
  })
  const withKey = standardHeaders({ apiKey: 'sk-1', baseURL: 'https://api.deepseek.com' }, 'sid')
  assert.equal(withKey.Authorization, 'Bearer sk-1')
  assert.equal(withKey['x-opencode-session'], undefined)

  const zen = standardHeaders({ apiKey: 'k', baseURL: 'https://opencode.ai/zen/go/v1' }, 'scope-1')
  assert.equal(zen['x-opencode-session'], 'scope-1')
})

test('请求体：思考开关与 usage 开关', () => {
  const messages = [
    { role: 'system', content: 's' },
    { role: 'user', content: 'u' },
  ]
  const plain = requestBody({ model: 'm', messages, maxTokens: 1000, thinking: false })
  assert.deepEqual(plain.thinking, { type: 'disabled' })
  assert.equal(plain.max_tokens, 1000)
  assert.equal(plain.temperature, 0.7)
  assert.equal(plain.stream, false)
  assert.equal(plain.stream_options, undefined)

  const stream = requestBody({ model: 'm', messages, maxTokens: 4000, thinking: true, stream: true, includeUsage: true })
  assert.deepEqual(stream.thinking, { type: 'enabled' })
  assert.deepEqual(stream.stream_options, { include_usage: true })
  assert.deepEqual(stream.messages, messages)

  const temp = requestBody({ model: 'm', messages, maxTokens: 10, thinking: false, temperature: 0.2 })
  assert.equal(temp.temperature, 0.2)
})

test('SSE 行解析：思考 / 正文 / usage / 结束 / 垃圾行', () => {
  const delta = parseChunk('data: {"choices":[{"delta":{"reasoning_content":"想"}}]}')
  assert.equal(delta.reasoning, '想')
  assert.equal(delta.content, '')
  assert.equal(delta.done, false)

  const content = parseChunk('data:{"choices":[{"delta":{"content":"答"}}]}')
  assert.equal(content.content, '答')

  const usage = parseChunk('data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}')
  assert.equal(usage.usage.promptTokens, 5)
  assert.equal(usage.content, '')

  assert.equal(parseChunk('data: [DONE]').done, true)
  assert.equal(parseChunk('event: ping').done, false)
  assert.equal(parseChunk('data: {坏 JSON').content, '')
  assert.equal(parseChunk('').content, '')
})

test('上游错误正文提炼为可读信息', () => {
  assert.equal(friendlyDetail('{"error":{"message":"余额不足"}}'), '余额不足')
  assert.equal(friendlyDetail('{"error":{}}'), '请检查网络或 Key 是否有效。')
  assert.equal(friendlyDetail('<html>502</html>'), '请检查网络或 Key 是否有效。')
  assert.equal(friendlyDetail(''), '请检查网络或 Key 是否有效。')
})
