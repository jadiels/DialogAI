import { useState } from 'react'
import { Icon } from '../ui/icons'

/** Collapsible "thinking" trace shown above the answer, collapsed by default. */
export default function Reasoning({ text, thinking }: { text: string; thinking: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <button
        onClick={() => setOpen((o) => !o)}
        title={thinking ? 'Thinking…' : 'Thoughts'}
        className="group/thought flex h-9 w-full items-center gap-2 px-3 text-sm text-gray-400 hover:text-gray-200"
      >
        <Icon
          name="chevronRight"
          size={14}
          className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <Icon name="brain" size={15} className={`shrink-0 ${thinking ? 'animate-pulse' : ''}`} />
        <span className={`hidden group-hover/thought:inline ${thinking ? 'animate-pulse' : ''}`}>
          {thinking ? 'Thinking…' : 'Thoughts'}
        </span>
      </button>
      {open && (
        <div className="whitespace-pre-wrap border-t border-white/10 px-3 py-2.5 text-sm leading-relaxed text-gray-400">
          {text}
          {thinking && <span className="animate-pulse">▍</span>}
        </div>
      )}
    </div>
  )
}
