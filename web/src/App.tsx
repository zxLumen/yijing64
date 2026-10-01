import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSessionState } from './lib/sessionState.js'
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
  const [storedTab, setTab] = useSessionState<TabId>('tab', 'cast')
  const tab: TabId = TABS.some((t) => t.id === storedTab) ? storedTab : 'cast'
  /** 首次访问过的 Tab 保持挂载（仅隐藏），切走再回来不丢临时状态 */
  const [visitedArr, setVisitedArr] = useSessionState<TabId[]>('visited', ['cast'])
  const visited = useMemo(() => new Set(visitedArr.filter((id) => TABS.some((t) => t.id === id))), [visitedArr])
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [records, setRecords] = useState<CastRecord[]>([])
  const [error, setError] = useState('')
  /** 从起卦/排卦/记录的「本·互·变」跳到卦库时要打开的第几卦 */
  const [libraryFocus, setLibraryFocus] = useState<number | null>(null)

  const selectTab = useCallback(
    (id: TabId) => {
      setVisitedArr((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setTab(id)
    },
    [setVisitedArr, setTab],
  )

  /** 在卦库打开指定卦（供三联点击调用） */
  const openInLibrary = useCallback(
    (kingWenNumber: number) => {
      setLibraryFocus(kingWenNumber)
      selectTab('library')
    },
    [selectTab],
  )

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
          <button key={item.id} type="button" className={item.id === tab ? 'active' : ''} onClick={() => selectTab(item.id)}>
            {item.label}
            {item.id === 'records' && records.length > 0 && <i>{records.length}</i>}
          </button>
        ))}
      </nav>

      <div className="body">
        {visited.has('cast') && (
          <div className="tab-pane" hidden={tab !== 'cast'}>
            <CastView session={session} onSaved={upsertRecord} onOpenHexagram={openInLibrary} />
          </div>
        )}
        {visited.has('records') && (
          <div className="tab-pane" hidden={tab !== 'records'}>
            <RecordsView
              records={records}
              session={session}
              readonly={readonly}
              onChanged={() => void loadRecords()}
              onOpenHexagram={openInLibrary}
            />
          </div>
        )}
        {visited.has('library') && (
          <div className="tab-pane" hidden={tab !== 'library'}>
            <LibraryView session={session} focusNumber={libraryFocus} onFocusConsumed={() => setLibraryFocus(null)} />
          </div>
        )}
        {visited.has('offline') && (
          <div className="tab-pane" hidden={tab !== 'offline'}>
            <OfflineView session={session} onSaved={upsertRecord} onOpenHexagram={openInLibrary} />
          </div>
        )}
        {visited.has('about') && (
          <div className="tab-pane" hidden={tab !== 'about'}>
            <AboutView session={session} onSessionChanged={() => void loadSession()} />
          </div>
        )}
      </div>

      <footer>
        <span>数据仅存于本站服务端，按访问者隔离</span>
        {session.owner && <span>站长 cid {session.cid.slice(0, 8)}…</span>}
      </footer>
    </main>
  )
}
