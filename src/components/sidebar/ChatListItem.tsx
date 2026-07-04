import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import type { Chat } from '../../lib/types'
import { useChatsStore } from '../../stores/chatsStore'
import { useUiStore } from '../../stores/uiStore'
import { Icon } from '../ui/icons'
import { Menu } from '../ui/Menu'

export default function ChatListItem({ chat }: { chat: Chat }) {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const streaming = useChatsStore((s) => !!s.streams[chat.id])
  const deleteChat = useChatsStore((s) => s.deleteChat)
  const renameChat = useChatsStore((s) => s.renameChat)
  const closeSidebar = useUiStore((s) => s.closeSidebar)
  const regenerateTitle = useChatsStore((s) => s.regenerateTitle)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(chat.title)
  const [titling, setTitling] = useState(false)

  // Typewriter reveal whenever the title changes after mount (e.g. an AI-
  // generated title being applied). Purely cosmetic — no real streaming.
  const [displayed, setDisplayed] = useState(chat.title)
  const [typing, setTyping] = useState(false)
  const prevTitle = useRef(chat.title)
  useEffect(() => {
    if (chat.title === prevTitle.current) return
    prevTitle.current = chat.title
    const full = chat.title
    setTyping(true)
    setDisplayed('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setDisplayed(full.slice(0, i))
      if (i >= full.length) {
        clearInterval(id)
        setTyping(false)
      }
    }, 28)
    return () => clearInterval(id)
  }, [chat.title])

  async function handleRegenerateTitle() {
    if (titling) return
    setTitling(true)
    try {
      await regenerateTitle(chat.id)
    } catch {
      // best-effort; keep the existing title on failure
    } finally {
      setTitling(false)
    }
  }

  if (renaming) {
    return (
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          renameChat(chat.id, title)
          setRenaming(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setTitle(chat.title)
            setRenaming(false)
          }
        }}
        className="rounded-lg bg-white/10 px-2.5 py-2 text-sm outline-none ring-1 ring-white/20"
      />
    )
  }

  return (
    <NavLink
      to={`/chat/${chat.id}`}
      onClick={() => closeSidebar()}
      className={({ isActive }) =>
        `group flex h-9 items-center rounded-lg px-2.5 text-sm hover:bg-white/10 ${
          isActive ? 'bg-white/10 text-gray-100' : 'text-gray-300'
        }`
      }
    >
      <Icon
        name={chat.agentId ? 'agents' : 'chat'}
        size={15}
        className="mr-2 shrink-0 text-gray-500"
      />
      <span className="min-w-0 flex-1 truncate" title={chat.agentName ? `Agent: ${chat.agentName}` : undefined}>
        {displayed}
        {typing && <span className="animate-pulse">▍</span>}
      </span>
      {(streaming || titling) && (
        <span className="ml-1.5 size-2 shrink-0 animate-pulse rounded-full bg-accent" />
      )}
      <Menu
        className="ml-1 hidden shrink-0 group-hover:block"
        button={<Icon name="dots" size={15} />}
        items={[
          {
            label: 'Rename',
            icon: 'edit',
            onClick: () => {
              setTitle(chat.title)
              setRenaming(true)
            },
          },
          {
            label: 'Regenerate title',
            icon: 'refresh',
            onClick: () => void handleRegenerateTitle(),
          },
          {
            label: 'Delete',
            icon: 'trash',
            danger: true,
            onClick: () => {
              if (confirm(`Delete chat "${chat.title}"? This cannot be undone.`)) {
                void deleteChat(chat.id)
                if (chatId === chat.id) navigate('/')
              }
            },
          },
        ]}
      />
    </NavLink>
  )
}
