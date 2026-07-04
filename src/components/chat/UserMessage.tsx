import { useState } from 'react'
import type { Chat, MessageNode } from '../../lib/types'
import { useChatsStore } from '../../stores/chatsStore'
import { Icon } from '../ui/icons'
import BranchNav from './BranchNav'

export default function UserMessage({ chat, node }: { chat: Chat; node: MessageNode }) {
  const editMessage = useChatsStore((s) => s.editMessage)
  const streaming = useChatsStore((s) => !!s.streams[chat.id])
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(node.content)

  if (editing) {
    return (
      <div className="flex justify-end">
        <div className="w-full max-w-xl rounded-3xl bg-bubble p-3">
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (value.trim()) {
                  void editMessage(chat.id, node.id, value.trim())
                  setEditing(false)
                }
              }
            }}
            rows={Math.min(value.split('\n').length + 1, 10)}
            className="w-full resize-none bg-transparent px-1 text-[15px] outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded-full px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!value.trim()) return
                void editMessage(chat.id, node.id, value.trim())
                setEditing(false)
              }}
              className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-900 hover:opacity-90"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="max-w-xl whitespace-pre-wrap rounded-3xl bg-bubble px-4 py-2.5 text-[15px]">
        {node.content}
      </div>
      <div className="flex h-6 items-center gap-1">
        <BranchNav chat={chat} node={node} />
        <button
          onClick={() => {
            setValue(node.content)
            setEditing(true)
          }}
          disabled={streaming}
          className="rounded-lg p-1 text-gray-400 opacity-0 hover:bg-white/10 hover:text-gray-100 disabled:opacity-0 group-hover:opacity-100"
          aria-label="Edit message (creates a new branch)"
          title="Edit — creates a new branch"
        >
          <Icon name="edit" size={14} />
        </button>
        <button
          onClick={() => void navigator.clipboard.writeText(node.content)}
          className="rounded-lg p-1 text-gray-400 opacity-0 hover:bg-white/10 hover:text-gray-100 group-hover:opacity-100"
          aria-label="Copy message"
        >
          <Icon name="copy" size={14} />
        </button>
      </div>
    </div>
  )
}
