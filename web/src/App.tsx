import { useCallback, useEffect, useState } from 'react'
import CastView from './views/Cast.js'
import LibraryView from './views/Library.js'
import RecordsView from './views/Records.js'
import OfflineView from './views/Offline.js'
import AboutView from './views/About.js'
import { getRecords, getSession, type SessionInfo } from './lib/api.js'
import type { CastRecord } from './core/types.js'

const TABS = [
  { id: 'offline', label: '线下排卦' },
  { id: 'cast', label: '起卦' },
  { id: 'records', label: '记录' },
  { id: 'library', label: '卦库' },
  { id: 'about', label: '关于' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [tab, setTab] = useState<TabId>('cast')
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [records, setRecords] = useState<CastRecord[]>([])
  const [error, setError] = useState('')

  const loadSession = useCallback(async () => {
    try {
      setSession(await getSession())
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法连接服务端。')
    }
  }, [])

  const loadRecords = useCallback(async () => {
    try {
      setRecords(await getRecords())
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取记录失败。')
    }
  }, [])

  /** 起卦页 / 线下排卦页落库后就地插入，省掉一次整表拉取 */
  const upsertRecord = useCallback((record: CastRecord) => {
    setRecords((prev) => [record, ...prev.filter((r) => r.id !== record.id)])
  }, [])

  useEffect(() => {
    void loadSession()
    void loadRecords()
  }, [loadSession, loadRecords])

  if (!session) {
    return (
      <main className="app">
        {error ? <p className="chat-error">{error}</p> : <p className="hint center">载入中…</p>}
      </main>
    )
  }

  const readonly = session.owner && !!session.viewing

  return (
    <main className="app">
      <header>
        <div className="brand">
          <b>易经六十四卦</b>
          <span>{session.model}</span>
        </div>
        <div className="badges">
          {session.owner && <span className="badge owner">站长</span>}
          {readonly && <span className="badge warn">只读查看访客</span>}
          {!session.hasAi && <span className="badge">未配置 AI</span>}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={item.id === tab ? 'active' : ''} onClick={() => setTab(item.id)}>
            {item.label}
            {item.id === 'records' && records.length > 0 && <i>{records.length}</i>}
          </button>
        ))}
      </nav>

      <div className="body">
        {/* 每个 Tab 独立挂载：切走即丢弃临时状态 */}
        {tab === 'cast' && <CastView session={session} onSaved={upsertRecord} />}
        {tab === 'records' && (
          <RecordsView records={records} session={session} readonly={readonly} onChanged={() => void loadRecords()} />
        )}
        {tab === 'library' && <LibraryView session={session} />}
        {tab === 'offline' && <OfflineView session={session} onSaved={upsertRecord} />}
        {tab === 'about' && <AboutView session={session} onSessionChanged={() => void loadSession()} />}
      </div>

      <footer>
        <span>数据仅存于本站服务端，按访问者隔离</span>
        {session.owner && <span>站长 cid {session.cid.slice(0, 8)}…</span>}
      </footer>
    </main>
  )
}
