import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import type { Agent } from '../lib/types'
import { useAgentsStore } from '../stores/agentsStore'
import { useActiveProfile } from '../stores/settingsStore'
import { useChatsStore } from '../stores/chatsStore'
import AgentCard from '../components/agents/AgentCard'
import AgentFormModal from '../components/agents/AgentFormModal'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/icons'

export default function AgentsPage() {
  const agents = useAgentsStore((s) => s.agents)
  const reorder = useAgentsStore((s) => s.reorder)
  const deleteAgent = useAgentsStore((s) => s.deleteAgent)
  const togglePinned = useAgentsStore((s) => s.togglePinned)
  const setDraft = useChatsStore((s) => s.setDraft)
  const profile = useActiveProfile()
  const navigate = useNavigate()
  const [modal, setModal] = useState<Agent | 'new' | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) void reorder(String(active.id), String(over.id))
  }

  function startChat(agent: Agent) {
    setDraft({
      agentId: agent.id,
      model: agent.defaultModel || profile?.defaultModel || null,
      profileId: null, // resolved to the primary enabled connection on send
    })
    navigate('/')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Agents</h1>
            <p className="text-sm text-gray-500">
              Reusable personas with a system prompt and default model. Click one to start a chat.
            </p>
          </div>
          <button
            onClick={() => setModal('new')}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
          >
            <Icon name="plus" size={15} />
            New agent
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="mt-16">
            <EmptyState
              icon="agents"
              title="No agents yet"
              description="Create an agent with a system prompt to reuse it across chats."
            />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={agents.map((a) => a.id)} strategy={rectSortingStrategy}>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onStartChat={() => startChat(agent)}
                    onEdit={() => setModal(agent)}
                    onTogglePin={() => void togglePinned(agent.id)}
                    onDelete={() => {
                      if (confirm(`Delete agent "${agent.name}"? Existing chats keep working.`)) {
                        void deleteAgent(agent.id)
                      }
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {modal && (
        <AgentFormModal agent={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
