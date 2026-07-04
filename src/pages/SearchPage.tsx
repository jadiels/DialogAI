import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Chat } from '../lib/types'
import { sortedChats, useChatsStore } from '../stores/chatsStore'
import { Icon } from '../components/ui/icons'

interface SearchHit {
  chat: Chat
  /** Message text around the first content match (undefined for title-only hits). */
  snippet?: { before: string; match: string; after: string }
}

function findHit(chat: Chat, query: string): SearchHit | null {
  const q = query.toLowerCase()
  const titleMatch = chat.title.toLowerCase().includes(q)
  for (const node of Object.values(chat.nodes)) {
    if (node.role === 'system' || !node.content) continue
    const idx = node.content.toLowerCase().indexOf(q)
    if (idx < 0) continue
    const start = Math.max(0, idx - 40)
    const end = Math.min(node.content.length, idx + q.length + 60)
    return {
      chat,
      snippet: {
        before: (start > 0 ? '…' : '') + node.content.slice(start, idx),
        match: node.content.slice(idx, idx + q.length),
        after: node.content.slice(idx + q.length, end) + (end < node.content.length ? '…' : ''),
      },
    }
  }
  return titleMatch ? { chat } : null
}

export default function SearchPage() {
  const chats = useChatsStore((s) => s.chats)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 200)
    return () => clearTimeout(t)
  }, [input])

  const hits = useMemo(() => {
    if (!query) return []
    return sortedChats(chats)
      .map((chat) => findHit(chat, query))
      .filter((h): h is SearchHit => h !== null)
  }, [chats, query])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-3 rounded-full bg-elevated px-4 py-3 ring-1 ring-white/10 focus-within:ring-white/25">
          <Icon name="search" size={18} className="shrink-0 text-gray-500" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search chats…"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-gray-500"
          />
        </div>

        <div className="mt-6 flex flex-col gap-1">
          {query && hits.length === 0 && (
            <p className="px-2 text-sm text-gray-500">No chats match “{query}”.</p>
          )}
          {hits.map(({ chat, snippet }) => (
            <Link
              key={chat.id}
              to={`/chat/${chat.id}`}
              className="rounded-xl px-3 py-2.5 hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Icon name="chat" size={14} className="shrink-0 text-gray-500" />
                <span className="truncate text-sm font-medium text-gray-200">{chat.title}</span>
                <span className="ml-auto shrink-0 text-xs text-gray-600">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {snippet && (
                <p className="mt-1 truncate pl-6 text-sm text-gray-500">
                  {snippet.before}
                  <mark className="rounded bg-accent/30 px-0.5 text-gray-200">
                    {snippet.match}
                  </mark>
                  {snippet.after}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
