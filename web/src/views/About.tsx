import { useEffect, useState } from 'react'
import type { VisitorInfo } from '../lib/api.js'
import {
  fetchModels,
  getChatState,
  getVisitors,
  saveChatConfig,
  saveChatKey,
  type ChatState,
  type SessionInfo,
} from '../lib/api.js'
import { fmtDate } from '../lib/format.js'

type Props = {
  session: SessionInfo
  onSessionChanged: () => void
}

export default function AboutView({ session, onSessionChanged }: Props) {
  const [state, setState] = useState<ChatState | null>(null)
  const [visitors, setVisitors] = useState<VisitorInfo[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({})
  /** 槽位输入草稿：失焦才提交，避免逐键请求与响应乱序回滚 */
  const [slotDraft, setSlotDraft] = useState<Record<string, { model?: string; baseURL?: string }>>({})

  const reload = async () => {
    setError('')
    try {
      const [chat, list] = await Promise.all([
        getChatState(),
        session.owner ? getVisitors() : Promise.resolve(null as unknown as VisitorInfo[]),
      ])
      setState(chat)
      setVisitors(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取配置失败。')
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.owner])

  const slot = state ? state.providers.find((p) => p.id === state.provider) : undefined

  const patchSlot = async (provider: string, next: { model?: string; baseURL?: string }) => {
    if (!state) return
    setBusy(true)
    setError('')
    try {
      const updated = await saveChatConfig({ providers: { [provider]: next } })
      setState(updated)
      onSessionChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。')
    } finally {
      setBusy(false)
    }
  }

  /** 提交槽位草稿；空串表示「恢复默认」（交给服务端回落）。 */
  const commitSlot = async (provider: string, field: 'model' | 'baseURL', value: string) => {
    const saved = state?.providers.find((p) => p.id === provider)
    if (!saved) return
    const current = field === 'model' ? saved.model : saved.baseURL
    const next = value.trim()
    setSlotDraft((prev) => {
      const { [provider]: _drop, ...rest } = prev
      return rest
    })
    if (next === current) return
    await patchSlot(provider, { [field]: next })
  }

  const patch = async (next: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    try {
      const updated = await saveChatConfig(next)
      setState(updated)
      onSessionChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败。')
    } finally {
      setBusy(false)
    }
  }

  const putKey = async (provider: string) => {
    const value = keyDraft[provider] ?? ''
    if (!value.trim()) return
    setBusy(true)
    setError('')
    try {
      const updated = await saveChatKey(provider, value)
      setState(updated)
      setKeyDraft((prev) => ({ ...prev, [provider]: '' }))
      onSessionChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存 Key 失败。')
    } finally {
      setBusy(false)
    }
  }

  const pullModels = async (provider: string) => {
    setBusy(true)
    setError('')
    try {
      const models = await fetchModels(provider)
      const first = models[0]
      if (first) await patchSlot(provider, { model: first.id })
      setSlotDraft((prev) => {
        const { [provider]: _drop, ...rest } = prev
        return rest
      })
      setError(`拉取到 ${models.length} 个模型，已选用 ${first?.id ?? ''}（可在上面手动改）`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '拉取模型列表失败。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view">
      <section className="card">
        <h3>关于这个网页版</h3>
        <p>
          起卦与解卦逻辑移植自原生 App 的 <code>YijingCore</code>
          （铜钱 / 梅花 / 卦象推导 / 互错综卦 / 体用 / 卦库检索 / 解卦提示词），Web
          与原生共用同一套算法，只是把「本地存储 + 本地 Key」换成「服务端按数据域隔离」。
        </p>
        <p>
          六十四卦结构表取自 <code>HexagramData.swift</code>，卦辞、爻辞与白话取自仓库{' '}
          <code>scripts/hexagram_content.json</code> 与 <code>scripts/divination.json</code>
          ，由 <code>scripts/export_web_data.py</code> 导出为 <code>web/src/data/*.json</code>。
        </p>
      </section>

      <section className="card">
        <h3>时间起卦的年支已修正</h3>
        <p>
          原生 App 的时间起卦把公历年直接当年支用，既错了干支年的分界（春节前应属上一干支年），甲子年还会算出 0。
          网页版改为按干支年取年支序（1984 甲子 = 子 = 1），年界以春节为准，闰月取本月月号 —— 这是梅花易数的传统用法。
        </p>
        <p className="hint">原生 App 仍是旧算法，所以同一时刻两端的时间起卦结果可能不同；本次只改网页版。</p>
      </section>

      <section className="card">
        <h3>当前解读配置</h3>
        {state ? (
          <>
            <p>
              服务商 <b>{state.providers.find((p) => p.id === state.provider)?.label}</b> · 模型{' '}
              <b>{state.model}</b>
            </p>
            <p className="hint">{state.baseURL}</p>
            <p>
              Key：{state.hasKey ? <b>已配置 {state.keyHint}</b> : '未配置'} · 放行访客使用：
              <b>{state.visitorAi ? '是' : '否'}</b>
            </p>
          </>
        ) : (
          <p className="hint">读取中…</p>
        )}
        {!session.owner && <p className="hint">AI 的服务商、模型与 Key 由站长在此配置，访客直接使用。</p>}
      </section>

      {session.owner && state && (
        <>
          <section className="card">
            <h3>站长 · AI 配置</h3>
            <label className="field">
              服务商
              <select value={state.provider} onChange={(e) => void patch({ provider: e.target.value })} disabled={busy}>
                {state.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.hasKey ? '（已配 Key）' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="provider-slots">
              {state.providers.map((p) => (
                <div key={p.id} className="slot" data-active={p.id === state.provider || undefined}>
                  <h4>
                    {p.label}
                    {p.id === state.provider && <b className="tag">当前</b>}
                  </h4>
                  <label className="field">
                    Base URL
                    <input
                      type="url"
                      value={slotDraft[p.id]?.baseURL ?? p.baseURL}
                      placeholder={p.defaultBaseURL || 'https://…'}
                      onChange={(e) => setSlotDraft((prev) => ({ ...prev, [p.id]: { ...prev[p.id], baseURL: e.target.value } }))}
                      onBlur={(e) => void commitSlot(p.id, 'baseURL', e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="field">
                    模型
                    <input
                      type="text"
                      value={slotDraft[p.id]?.model ?? p.model}
                      placeholder={p.defaultModel || 'model-name'}
                      onChange={(e) => setSlotDraft((prev) => ({ ...prev, [p.id]: { ...prev[p.id], model: e.target.value } }))}
                      onBlur={(e) => void commitSlot(p.id, 'model', e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <div className="field-row">
                    <input
                      type="password"
                      value={keyDraft[p.id] ?? ''}
                      placeholder={p.hasKey ? `已保存 ${p.keyHint}（输入新值覆盖）` : '粘贴 API Key'}
                      onChange={(e) => setKeyDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      disabled={busy}
                      autoComplete="off"
                    />
                    <button type="button" onClick={() => void putKey(p.id)} disabled={busy || !(keyDraft[p.id] ?? '').trim()}>
                      保存 Key
                    </button>
                    <button type="button" className="ghost" onClick={() => void pullModels(p.id)} disabled={busy}>
                      拉取模型
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <label className="field">
              默认输出上限（默认解卦，token）
              <input
                type="number"
                value={state.maxTokens}
                onChange={(e) => void patch({ maxTokens: Number(e.target.value) })}
                disabled={busy}
              />
            </label>
            <label className="field">
              提问时输出上限（含思考，token）
              <input
                type="number"
                value={state.thinkingMaxTokens}
                onChange={(e) => void patch({ thinkingMaxTokens: Number(e.target.value) })}
                disabled={busy}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={state.visitorAi}
                onChange={(e) => void patch({ visitorAi: e.target.checked })}
                disabled={busy}
              />
              放行访客使用 AI（走这里配的 Key 与模型）
            </label>
            {slot && <p className="hint">改完即时生效；Key 只存在服务端，不会回传给浏览器。</p>}
          </section>

          <section className="card">
            <h3>站长 · 访客记录</h3>
            {visitors === null && <p className="hint">读取中…</p>}
            {visitors && !visitors.length && <p className="hint">还没有访客产生记录。</p>}
            {visitors && visitors.length > 0 && (
              <ul className="visitor-list">
                {visitors.map((v) => (
                  <li key={v.cid}>
                    <span>
                      <b>{v.cid.slice(0, 8)}…</b>
                      <i>
                        {v.count} 条 · {v.summary.asked} 有提问 · {v.summary.ai} 已解读 · 动爻 {v.summary.lines}
                      </i>
                      <i>{v.updatedAt ? fmtDate(v.updatedAt) : '—'}</i>
                    </span>
                    <button type="button" className="ghost" onClick={() => (window.location.href = `/?view=${v.cid}`)}>
                      查看
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {session.viewing && (
              <div className="actions">
                <span className="chat-warn">正在以只读方式查看访客 {session.viewing.slice(0, 8)}… 的数据。</span>
                <button type="button" onClick={() => (window.location.href = '/?view=')}>
                  回到我的数据
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {error && <p className="chat-error">{error}</p>}
    </div>
  )
}
