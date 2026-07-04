import { useRef, useState } from 'react'
import { Icon } from '../ui/icons'
import { useClickOutside } from '../ui/useClickOutside'

export interface ModelGroup {
  id: string
  name: string
  models: string[]
}

/**
 * Model combobox grouped by connection. Click to browse the full list, type to
 * filter, free text always allowed. Same interaction as ModelPicker.
 */
export default function GroupedModelPicker({
  groups,
  value,
  onChange,
  placeholder = 'Select a model…',
}: {
  groups: ModelGroup[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function openList() {
    setTyped(false)
    setOpen(true)
  }

  const q = value.trim().toLowerCase()
  const filtered = groups
    .map((g) => ({
      ...g,
      models: typed && q ? g.models.filter((m) => m.toLowerCase().includes(q)) : g.models,
    }))
    .filter((g) => g.models.length > 0)

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center rounded-lg bg-white/5 ring-1 ring-white/10 focus-within:ring-white/25">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setTyped(true)
            setOpen(true)
          }}
          onFocus={openList}
          onMouseDown={openList}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter') {
              e.preventDefault()
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-500"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => (open ? setOpen(false) : openList())}
          className="shrink-0 px-2 py-2 text-gray-400 hover:text-gray-200"
          aria-label="Toggle model list"
        >
          <Icon name="chevronDown" size={15} />
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/10 bg-elevated py-1 shadow-xl">
          {filtered.map((g) => (
            <div key={g.id}>
              <div className="px-3 pb-0.5 pt-1.5 text-xs font-medium text-gray-500">{g.name}</div>
              {g.models.map((m) => (
                <button
                  key={`${g.id}:${m}`}
                  type="button"
                  onClick={() => {
                    onChange(m)
                    setOpen(false)
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10"
                >
                  <span className="truncate">{m}</span>
                  {m === value.trim() && (
                    <Icon name="check" size={14} className="shrink-0 text-gray-400" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
