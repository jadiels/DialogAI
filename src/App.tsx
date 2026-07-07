import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './components/sidebar/Sidebar'
import { useChatsStore } from './stores/chatsStore'
import { useAgentsStore } from './stores/agentsStore'
import { useUiStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useMcpStore } from './stores/mcpStore'
import { applyTheme, watchSystemTheme } from './lib/theme'
import { Icon } from './components/ui/icons'

export default function App() {
  const navigate = useNavigate()
  const openSidebar = useUiStore((s) => s.openSidebar)
  const collapsed = useSettingsStore((s) => s.settings.ui.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)
  const theme = useSettingsStore((s) => s.settings.ui.theme ?? 'auto')

  useEffect(() => {
    void useChatsStore.getState().loadAll()
    void useAgentsStore.getState().loadAll()
    // Connect enabled MCP servers so chat tools are available after a reload.
    useMcpStore.getState().connectEnabled()
  }, [])

  useEffect(() => {
    applyTheme(theme)
    return watchSystemTheme(theme, () => applyTheme(theme))
  }, [theme])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      // Don't hijack typing in the composer or any text field.
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (e.key === 'k') {
        e.preventDefault()
        navigate('/search')
      } else if (e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        useChatsStore.getState().resetDraft()
        navigate('/')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex h-screen bg-surface text-gray-100">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-2 md:hidden">
          <button
            onClick={openSidebar}
            className="rounded-lg p-2 text-gray-300 hover:bg-white/10"
            aria-label="Open menu"
          >
            <Icon name="menu" size={18} />
          </button>
          <span data-brand className="flex items-center gap-2 font-medium">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-5 rounded" />
            DialogAI
          </span>
        </div>
        {collapsed && (
          <div className="hidden h-12 shrink-0 items-center border-b border-white/10 px-2 md:flex">
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="rounded-lg p-2 text-gray-300 hover:bg-white/10"
              aria-label="Show sidebar"
              title="Show sidebar"
            >
              <Icon name="panelLeft" size={18} />
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}
