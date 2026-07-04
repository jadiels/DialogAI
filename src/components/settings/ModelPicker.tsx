import { useRef, useState } from 'react'
import { Icon } from '../ui/icons'
import { useClickOutside } from '../ui/useClickOutside'

/**
 * Model combobox: click to browse the full cached model list, type to filter,
 * and free text is always allowed (fallback when /v1/models is unavailable).
 * Replaces the native <datalist>, which opens unreliably across browsers.
 */
export default function ModelPicker({
  models,
  value,
  onChange,
  placeholder = 'e.g. llama3.2',
}: {
  models: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  // Only filter by the field's text once the user actually types — opening a
  // pre-filled field should still show the whole list.
  const [typed, setTyped] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  function openList() {
    setTyped(false)
    setOpen(true)
  }

  const q = value.trim().toLowerCase()
  const list = typed && q ? models.filter((m) => m.toLowerCase().includes(q)) : models
  const isCustom = !!value.trim() && !models.some((m) => m === value.trim())

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

      {open && (models.length > 0 || isCustom) && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-elevated py-1 shadow-xl">
          {list.map((m) => (
            <button
              key={m}
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
          {typed && q && list.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No match — will use as custom model.</div>
          )}
          {isCustom && (
            <div className="border-t border-white/10 px-3 py-2 text-xs text-gray-500">
              Using custom model “{value.trim()}”
            </div>
          )}
        </div>
      )}
    </div>
  )
}
