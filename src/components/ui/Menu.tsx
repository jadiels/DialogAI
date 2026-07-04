import { useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { useClickOutside } from './useClickOutside'

export interface MenuItem {
  label: string
  icon?: IconName
  danger?: boolean
  onClick: () => void
}

/** Small dropdown menu anchored to its trigger button. */
export function Menu({
  button,
  items,
  className = '',
  align = 'right',
}: {
  button: ReactNode
  items: MenuItem[]
  className?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false))

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((o) => !o)
        }}
        className="flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100"
        aria-label="More options"
      >
        {button}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1 min-w-36 rounded-xl border border-white/10 bg-elevated py-1 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setOpen(false)
                item.onClick()
              }}
              className={`flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-sm hover:bg-white/10 ${
                item.danger ? 'text-red-400' : 'text-gray-200'
              }`}
            >
              {item.icon && <Icon name={item.icon} size={15} className="shrink-0" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
