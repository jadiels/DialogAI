import { Link, useNavigate, useParams } from 'react-router-dom'
import { useChatsStore } from '../stores/chatsStore'
import { useAgentsStore } from '../stores/agentsStore'
import { useActiveProfile } from '../stores/settingsStore'
import ModelSelector from '../components/chat/ModelSelector'
import ChatSettings from '../components/chat/ChatSettings'
import MessageList from '../components/chat/MessageList'
import Composer from '../components/chat/Composer'
import { EmptyState } from '../components/ui/EmptyState'

export default function ChatPage() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const chat = useChatsStore((s) => (chatId ? s.chats[chatId] : undefined))
  const loaded = useChatsStore((s) => s.loaded)
  const streaming = useChatsStore((s) => (chatId ? !!s.streams[chatId] : false))
  const draft = useChatsStore((s) => s.draft)
  const agents = useAgentsStore((s) => s.agents)
  const profile = useActiveProfile()

  const sendMessage = useChatsStore((s) => s.sendMessage)
  const startChat = useChatsStore((s) => s.startChat)
  const stop = useChatsStore((s) => s.stop)

  if (!profile) {
    return (
      <EmptyState
        icon="settings"
        title="No connection configured"
        description="Add an OpenAI-compatible or Ollama connection to start chatting."
        action={
          <Link
            to="/settings"
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
          >
            Open Settings
          </Link>
        }
      />
    )
  }

  if (chatId && loaded && !chat) {
    return <EmptyState icon="chat" title="Chat not found" description="It may have been deleted." />
  }

  const draftAgent = draft.agentId ? agents.find((a) => a.id === draft.agentId) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-13 shrink-0 items-center gap-1 px-3">
        <ModelSelector chat={chat} />
        <ChatSettings chat={chat} />
      </header>

      {chat ? (
        <MessageList key={chat.id} chat={chat} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <h1 className="text-2xl font-semibold text-gray-200">
            {draftAgent ? draftAgent.name : 'What can I help with?'}
          </h1>
          {draftAgent && (
            <p className="line-clamp-3 max-w-md text-sm text-gray-500">{draftAgent.systemPrompt}</p>
          )}
        </div>
      )}

      <Composer
        streaming={streaming}
        onStop={() => chatId && stop(chatId)}
        onSend={(content, images) => {
          if (chat) {
            void sendMessage(chat.id, content, images)
          } else {
            void startChat(content, images).then((id) => {
              if (id) navigate(`/chat/${id}`)
            })
          }
        }}
      />
    </div>
  )
}
