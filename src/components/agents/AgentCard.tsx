import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Agent } from '../../lib/types'
import { Icon } from '../ui/icons'
import { Menu } from '../ui/Menu'

export default function AgentCard({
  agent,
  onStartChat,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  agent: Agent
  onStartChat: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative rounded-2xl border border-white/10 bg-elevated/50 p-4 transition-colors hover:border-white/20 hover:bg-elevated ${
        isDragging ? 'z-10 opacity-70 shadow-2xl' : ''
      }`}
    >
      {/* drag handle — top-left, only visible on hover */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 cursor-grab rounded-lg p-1.5 text-gray-500 opacity-0 hover:bg-white/10 hover:text-gray-200 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <Icon name="grip" size={15} />
      </button>

      {/* ⋯ menu — top-right, only visible on hover */}
      <div className="absolute right-2 top-2 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
        <Menu
          button={<Icon name="dots" size={16} />}
          items={[
            { label: 'Edit', icon: 'edit', onClick: onEdit },
            {
              label: agent.pinned ? 'Unpin from menu' : 'Pin to menu',
              icon: 'pin',
              onClick: onTogglePin,
            },
            { label: 'Delete', icon: 'trash', danger: true, onClick: onDelete },
          ]}
        />
      </div>

      <button onClick={onStartChat} className="flex w-full flex-col items-center gap-2 pt-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-white/10 text-gray-300">
          <Icon name="agents" size={22} />
        </div>
        <span className="font-medium text-gray-100">{agent.name}</span>
        <span className="line-clamp-2 text-xs text-gray-500">{agent.systemPrompt}</span>
        {agent.defaultModel && (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">
            {agent.defaultModel}
          </span>
        )}
      </button>
    </div>
  )
}
