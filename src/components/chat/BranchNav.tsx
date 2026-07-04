import type { Chat, MessageNode } from '../../lib/types'
import { siblingInfo } from '../../lib/messageTree'
import { useChatsStore } from '../../stores/chatsStore'
import { Icon } from '../ui/icons'

/** The "< 2/2 >" control shown on messages that have sibling branches. */
export default function BranchNav({ chat, node }: { chat: Chat; node: MessageNode }) {
  const navigate = useChatsStore((s) => s.navigate)
  const { index, count } = siblingInfo(chat, node.id)
  if (count < 2) return null

  return (
    <div className="flex items-center gap-0.5 text-xs text-gray-400">
      <button
        onClick={() => navigate(chat.id, node.id, -1)}
        disabled={index === 0}
        className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30"
        aria-label="Previous branch"
      >
        <Icon name="chevronLeft" size={14} />
      </button>
      <span className="tabular-nums">
        {index + 1}/{count}
      </span>
      <button
        onClick={() => navigate(chat.id, node.id, 1)}
        disabled={index === count - 1}
        className="rounded p-0.5 hover:bg-white/10 disabled:opacity-30"
        aria-label="Next branch"
      >
        <Icon name="chevronRight" size={14} />
      </button>
    </div>
  )
}
