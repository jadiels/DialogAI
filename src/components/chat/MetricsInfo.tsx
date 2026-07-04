import { useState } from 'react'
import type { MessageMetrics } from '../../lib/types'
import { Icon } from '../ui/icons'

function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

/** Ollama durations are in nanoseconds. */
function fmtNs(ns: number): string {
  return fmtMs(ns / 1e6)
}

function rate(count: number | undefined, durationNs: number | undefined): string | null {
  if (!count || !durationNs) return null
  return `${(count / (durationNs / 1e9)).toFixed(2)} tok/s`
}

/** Info icon that reveals a popup with all streaming metrics (OpenWebUI-style). */
export default function MetricsInfo({
  metrics,
  model,
  connection,
  reasoningChars,
}: {
  metrics: MessageMetrics
  model?: string
  connection?: string
  reasoningChars?: number
}) {
  const [open, setOpen] = useState(false)
  const u = metrics.usage
  const t = metrics.timings

  const reasoningTokens =
    u?.reasoning_tokens ??
    (reasoningChars && reasoningChars > 0 ? Math.round(reasoningChars / 4) : undefined)
  const reasoningApprox = u?.reasoning_tokens === undefined

  const rows: [string, string][] = []
  if (connection) rows.push(['Connection', connection])
  if (model) rows.push(['Model', model])
  rows.push(['Time to first token', fmtMs(metrics.ttftMs)])
  rows.push(['Throughput', `${metrics.tokensPerSecond.toFixed(1)} tok/s`])
  rows.push([
    u?.completion_tokens !== undefined || !metrics.approx ? 'Response tokens' : 'Response tokens (est.)',
    String(u?.completion_tokens ?? metrics.tokens),
  ])
  if (reasoningTokens !== undefined) {
    rows.push([`Reasoning tokens${reasoningApprox ? ' (est.)' : ''}`, String(reasoningTokens)])
  }
  if (u?.prompt_tokens !== undefined) rows.push(['Prompt tokens', String(u.prompt_tokens)])
  if (u?.total_tokens !== undefined) rows.push(['Total tokens', String(u.total_tokens)])
  if (u?.accepted_prediction_tokens !== undefined)
    rows.push(['Accepted prediction', String(u.accepted_prediction_tokens)])
  if (u?.rejected_prediction_tokens !== undefined)
    rows.push(['Rejected prediction', String(u.rejected_prediction_tokens)])
  rows.push(['Total duration', fmtMs(metrics.totalMs)])

  if (t) {
    const evalRate = rate(t.eval_count, t.eval_duration)
    const promptRate = rate(t.prompt_eval_count, t.prompt_eval_duration)
    if (evalRate) rows.push(['Eval rate', evalRate])
    if (promptRate) rows.push(['Prompt eval rate', promptRate])
    if (t.eval_count !== undefined) rows.push(['Eval count', String(t.eval_count)])
    if (t.prompt_eval_count !== undefined) rows.push(['Prompt eval count', String(t.prompt_eval_count)])
    if (t.total_duration !== undefined) rows.push(['Server total', fmtNs(t.total_duration)])
    if (t.load_duration !== undefined) rows.push(['Load', fmtNs(t.load_duration)])
    if (t.prompt_eval_duration !== undefined) rows.push(['Prompt eval time', fmtNs(t.prompt_eval_duration)])
    if (t.eval_duration !== undefined) rows.push(['Eval time', fmtNs(t.eval_duration)])
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-gray-100"
        aria-label="Response metrics"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="info" size={14} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1 max-h-96 w-64 overflow-y-auto rounded-xl border border-white/10 bg-elevated p-3 shadow-xl">
          <div className="mb-2 text-xs font-medium text-gray-300">Response info</div>
          <dl className="flex flex-col gap-1.5">
            {rows.map(([label, val]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="truncate text-xs tabular-nums text-gray-200">{val}</dd>
              </div>
            ))}
          </dl>
          {metrics.approx && !u && (
            <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-snug text-gray-500">
              Token counts estimated from stream chunks — the server didn’t report usage.
            </p>
          )}
        </div>
      )}
    </span>
  )
}
