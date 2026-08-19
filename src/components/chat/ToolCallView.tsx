import { useState } from 'react'
import type { MessageNode, ToolCall } from '../../lib/types'
import { splitToolName } from '../../lib/mcp'
import { Icon } from '../ui/icons'

function displayName(namespaced: string): string {
  return splitToolName(namespaced)?.toolName ?? namespaced
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Full request payload for the call, pretty-printed. */
function prettyRequest(call: ToolCall): string {
  return JSON.stringify(
    { id: call.id, name: call.name, arguments: tryParseJson(call.arguments) },
    null,
    2,
  )
}

/** Tool result pretty-printed as JSON when it parses, raw text otherwise. */
function prettyResult(content: string): string {
  const parsed = tryParseJson(content)
  return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)
}

/**
 * Collapsible block for one tool invocation: the request (from the assistant
 * node's toolCalls) paired with its result node, if it has arrived yet.
 */
export default function ToolCallView({ call, result }: { call: ToolCall; result?: MessageNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 px-3 text-sm text-gray-400 hover:text-gray-200"
      >
        <Icon
          name="chevronRight"
          size={14}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Icon name="settings" size={14} className={`shrink-0 ${result ? '' : 'animate-pulse'}`} />
        <span className="truncate">
          {displayName(call.name)}
          {!result && <span className="animate-pulse"> — running…</span>}
        </span>
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 py-2.5 text-sm leading-relaxed text-gray-400">
          <div className="mb-1 text-xs text-gray-500">Request</div>
          <pre className="mb-2 overflow-x-auto whitespace-pre-wrap text-xs">{prettyRequest(call)}</pre>
          {result && (
            <>
              <div className="mb-1 text-xs text-gray-500">Response</div>
              <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{prettyResult(result.content)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
