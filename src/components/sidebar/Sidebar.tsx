import { NavLink, useNavigate } from 'react-router-dom'
import { sortedChats, useChatsStore } from '../../stores/chatsStore'
import { useUiStore } from '../../stores/uiStore'
import { activeProfile, useSettingsStore } from '../../stores/settingsStore'
import { useAgentsStore } from '../../stores/agentsStore'
import { Icon, type IconName } from '../ui/icons'
import ChatListItem from './ChatListItem'

function NavItem({
  to,
  icon,
  label,
  onClick,
  className = '',
}: {
  to: string
  icon: IconName
  label: string
  onClick?: () => void
  className?: string
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-white/10 ${
          isActive ? 'bg-white/10 text-gray-100' : 'text-gray-300'
        } ${className}`
      }
    >
      <Icon name={icon} size={17} />
      {label}
    </NavLink>
  )
}

const THEME_ORDER = ['auto', 'light', 'dark'] as const
const THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' } as const

export default function Sidebar() {
  const chats = useChatsStore((s) => s.chats)
  const resetDraft = useChatsStore((s) => s.resetDraft)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const closeSidebar = useUiStore((s) => s.closeSidebar)
  const collapsed = useSettingsStore((s) => s.settings.ui.sidebarCollapsed)
  const setSidebarCollapsed = useSettingsStore((s) => s.setSidebarCollapsed)
  const theme = useSettingsStore((s) => s.settings.ui.theme ?? 'auto')
  const setTheme = useSettingsStore((s) => s.setTheme)
  const settings = useSettingsStore((s) => s.settings)
  const agents = useAgentsStore((s) => s.agents)
  const setDraft = useChatsStore((s) => s.setDraft)
  const navigate = useNavigate()
  const list = sortedChats(chats)
  const pinnedAgents = agents.filter((a) => a.pinned)

  function startAgentChat(agentId: string) {
    const agent = agents.find((a) => a.id === agentId)
    const profile = activeProfile(settings)
    setDraft({
      agentId,
      model: agent?.defaultModel || profile?.defaultModel || null,
      profileId: null,
    })
    closeSidebar()
    navigate('/')
  }

  return (
    <>
      {/* Backdrop on mobile when the drawer is open. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={closeSidebar} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-sidebar transition-transform md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:hidden' : ''}`}
      >
        <div className="flex items-center justify-between px-3 pt-2">
          <span className="flex items-center gap-2 font-semibold">
            <img src="/favicon.svg" alt="" className="size-5 rounded" />
            DialogAI
          </span>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="hidden rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-200 md:block"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <Icon name="panelLeft" size={17} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 p-2">
          <NavItem
            to="/"
            icon="edit"
            label="New chat"
            onClick={() => {
              resetDraft()
              closeSidebar()
              navigate('/')
            }}
          />
          <NavItem to="/search" icon="search" label="Search" onClick={closeSidebar} />
          <NavItem to="/agents" icon="agents" label="Agents" onClick={closeSidebar} />
          {pinnedAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => startAgentChat(agent.id)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 pl-8 text-left text-sm text-gray-300 hover:bg-white/10"
              title={`New chat with ${agent.name}`}
            >
              <Icon name="agents" size={15} className="shrink-0 text-gray-500" />
              <span className="min-w-0 truncate">{agent.name}</span>
            </button>
          ))}
          <NavItem to="/images" icon="image" label="Images" onClick={closeSidebar} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <div className="px-2.5 pb-1 pt-3 text-xs font-medium text-gray-500">Chats</div>
          {list.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-gray-500">No chats yet</div>
          )}
          <div className="flex flex-col gap-0.5">
            {list.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-white/10 p-2">
          <NavItem
            to="/settings"
            icon="settings"
            label="Settings"
            onClick={closeSidebar}
            className="min-w-0 flex-1"
          />
          <button
            onClick={() => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % 3])}
            className="shrink-0 rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-gray-100"
            aria-label={`Theme: ${theme}. Click to change.`}
            title={`Theme: ${theme} — click to change`}
          >
            <Icon name={THEME_ICON[theme]} size={17} />
          </button>
        </div>
      </aside>
    </>
  )
}
