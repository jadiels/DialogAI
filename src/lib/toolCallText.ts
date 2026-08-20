import { nanoid } from 'nanoid'
import type { ToolCall } from './types'

/**
 * Fallback for models that emit tool calls as literal
 * `<tool_call>{"name": …, "arguments": …}</tool_call>` text instead of the
 * structured tool_calls field — e.g. qwen-family fine-tunes that place the
 * call inside an unterminated <think> block, which the server then surfaces
 * as plain reasoning/content text.
 */

const TOOL_CALL_RE = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g

/** Blocks whose JSON doesn't parse to a named call are left in the text untouched. */
function parseBlock(body: string): ToolCall | null {
  try {
    const json = JSON.parse(body) as { name?: unknown; arguments?: unknown }
    if (typeof json.name !== 'string' || !json.name) return null
    const args =
      typeof json.arguments === 'string' ? json.arguments : JSON.stringify(json.arguments ?? {})
    return { id: nanoid(), name: json.name, arguments: args }
  } catch {
    return null
  }
}

/** Extract `<tool_call>` blocks from `text`, returning the cleaned text and the parsed calls. */
export function extractToolCallText(text: string): { text: string; calls: ToolCall[] } {
  const calls: ToolCall[] = []
  const cleaned = text.replace(TOOL_CALL_RE, (match, body: string) => {
    const call = parseBlock(body)
    if (!call) return match
    calls.push(call)
    return ''
  })
  return { text: calls.length ? cleaned.trim() : text, calls }
}

/**
 * Extract text-form tool calls from an assistant node's reasoning + content.
 * Returns null when neither channel contains one; otherwise the cleaned
 * channels and the calls in emission order (reasoning streams first).
 */
export function extractNodeToolCalls(
  content: string,
  reasoning: string | undefined,
): { content: string; reasoning: string | undefined; calls: ToolCall[] } | null {
  const r = extractToolCallText(reasoning ?? '')
  const c = extractToolCallText(content)
  const calls = [...r.calls, ...c.calls]
  if (!calls.length) return null
  return { content: c.text, reasoning: r.text || undefined, calls }
}
