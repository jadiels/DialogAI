import { useEffect, useMemo, useRef } from 'react'
import type { Chat } from '../../lib/types'
import { resolvePath } from '../../lib/messageTree'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'

export default function MessageList({ chat }: { chat: Chat }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)
  const path = useMemo(() => resolvePath(chat), [chat])
  // Tool results are rendered inside the assistant message that requested
  // them, so index them by the call they answer.
  const toolResults = useMemo(() => {
    const map = new Map<string, (typeof path)[number]>()
    for (const node of path) {
      if (node.role === 'tool' && node.toolCallId) map.set(node.toolCallId, node)
    }
    return map
  }, [path])

  useEffect(() => {
    const el = containerRef.current
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight
  }, [path])

  return (
    <div
      ref={containerRef}
      onScroll={(e) => {
        const el = e.currentTarget
        // stick to the bottom during streaming unless the user scrolled up
        pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        {path
          .filter((node) => node.role === 'user' || node.role === 'assistant')
          .map((node) =>
            node.role === 'user' ? (
              <UserMessage key={node.id} chat={chat} node={node} />
            ) : (
              <AssistantMessage key={node.id} chat={chat} node={node} toolResults={toolResults} />
            ),
          )}
      </div>
    </div>
  )
}
