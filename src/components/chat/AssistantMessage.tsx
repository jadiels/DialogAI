import { useState } from 'react'
import type { Chat, MessageNode } from '../../lib/types'
import { useChatsStore } from '../../stores/chatsStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { Icon } from '../ui/icons'
import { Markdown } from './Markdown'
import BranchNav from './BranchNav'
import MetricsInfo from './MetricsInfo'
import Reasoning from './Reasoning'
import ToolCallView from './ToolCallView'

export default function AssistantMessage({
  chat,
  node,
  toolResults,
}: {
  chat: Chat
  node: MessageNode
  /** Tool-result nodes in the visible path, keyed by toolCallId. */
  toolResults?: Map<string, MessageNode>
}) {
  const regenerate = useChatsStore((s) => s.regenerate)
  const streaming = useChatsStore((s) => !!s.streams[chat.id])
  const connection = useSettingsStore(
    (s) => s.settings.profiles.find((p) => p.id === chat.profileId)?.name,
  )
  const [copied, setCopied] = useState(false)
  const isStreamingThis = node.status === 'streaming' && streaming

  return (
    <div className="group flex flex-col gap-1">
      {node.reasoning && (
        <Reasoning text={node.reasoning} thinking={isStreamingThis && !node.content} />
      )}
      {node.toolCalls?.map((call) => (
        <ToolCallView key={call.id || call.name} call={call} result={toolResults?.get(call.id)} />
      ))}
      {node.content ? (
        <Markdown content={node.content} />
      ) : isStreamingThis && !node.reasoning ? (
        <div className="animate-pulse text-gray-400">▍</div>
      ) : null}
      {isStreamingThis && node.content && (
        <span className="-mt-1 animate-pulse text-gray-400">▍</span>
      )}

      {node.status === 'error' && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <span className="min-w-0 flex-1">{node.error ?? 'Something went wrong.'}</span>
          <button
            onClick={() => void regenerate(chat.id, node.id)}
            disabled={streaming}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs text-gray-200 hover:bg-white/20 disabled:opacity-50"
          >
            <Icon name="refresh" size={12} />
            Retry
          </button>
        </div>
      )}

      {!isStreamingThis && (
        <div className="flex h-6 items-center gap-1">
          <BranchNav chat={chat} node={node} />
          <button
            onClick={() => {
              void navigator.clipboard.writeText(node.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="rounded-lg p-1 text-gray-400 opacity-0 hover:bg-white/10 hover:text-gray-100 group-hover:opacity-100"
            aria-label="Copy response"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
          <button
            onClick={() => void regenerate(chat.id, node.id)}
            disabled={streaming}
            className="rounded-lg p-1 text-gray-400 opacity-0 hover:bg-white/10 hover:text-gray-100 disabled:opacity-0 group-hover:opacity-100"
            aria-label="Regenerate (creates a new branch)"
            title="Regenerate — creates a new branch"
          >
            <Icon name="refresh" size={14} />
          </button>
          {node.model && (
            <span className="text-xs text-gray-500 opacity-0 group-hover:opacity-100">
              {node.model}
            </span>
          )}
          {node.metrics && (
            <span className="opacity-0 group-hover:opacity-100">
              <MetricsInfo
                metrics={node.metrics}
                model={node.model}
                connection={connection}
                reasoningChars={node.reasoning?.length}
              />
            </span>
          )}
        </div>
      )}
    </div>
  )
}
