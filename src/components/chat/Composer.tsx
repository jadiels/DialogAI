import { useRef, useState } from 'react'
import { Icon } from '../ui/icons'

export default function Composer({
  disabled,
  streaming,
  onSend,
  onStop,
  placeholder = 'Message DialogAI…',
}: {
  disabled?: boolean
  streaming?: boolean
  onSend: (content: string) => void
  onStop?: () => void
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canSend = !disabled && !streaming && value.trim().length > 0

  function send() {
    if (!canSend) return
    onSend(value.trim())
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="flex items-end gap-2 rounded-3xl bg-elevated px-4 py-2.5 ring-1 ring-white/10 focus-within:ring-white/20">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value)
            e.currentTarget.style.height = 'auto'
            e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 200)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          className="max-h-50 min-h-6 flex-1 resize-none bg-transparent py-1 text-[15px] outline-none placeholder:text-gray-500 disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={onStop}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-900 hover:opacity-90"
            aria-label="Stop generating"
          >
            <Icon name="stop" size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={send}
            disabled={!canSend}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-900 hover:opacity-90 disabled:opacity-30"
            aria-label="Send message"
          >
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
