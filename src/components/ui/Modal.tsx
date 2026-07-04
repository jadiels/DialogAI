import { useEffect, type ReactNode } from 'react'
import { Icon } from './icons'

const SIZES = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' } as const

export function Modal({
  title,
  onClose,
  children,
  size = 'md',
  closeOnBackdrop = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  size?: keyof typeof SIZES
  /** When false, clicking the backdrop won't close (avoids losing unsaved input). */
  closeOnBackdrop?: boolean
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`max-h-[90vh] w-full ${SIZES[size]} overflow-y-auto rounded-2xl bg-elevated p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100"
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
