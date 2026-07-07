import { useRef, useState } from 'react'
import { fileToDataUri, imageFiles } from '../../lib/image'
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
  onSend: (content: string, images?: string[]) => void
  onStop?: () => void
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const canSend = !disabled && !streaming && (value.trim().length > 0 || images.length > 0)

  function send() {
    if (!canSend) return
    onSend(value.trim(), images.length ? images : undefined)
    setValue('')
    setImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  async function attach(files: File[]) {
    if (!files.length) return
    const uris = await Promise.all(files.map(fileToDataUri))
    setImages((prev) => [...prev, ...uris])
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="rounded-3xl bg-elevated px-4 py-2.5 ring-1 ring-white/10 focus-within:ring-white/20">
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="group relative">
                <img
                  src={src}
                  alt={`Attachment ${i + 1}`}
                  className="size-16 rounded-lg border border-white/10 object-cover"
                />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-gray-900 text-gray-300 ring-1 ring-white/20 hover:text-white"
                  aria-label={`Remove attachment ${i + 1}`}
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void attach([...(e.target.files ?? [])])
              e.target.value = '' // allow re-selecting the same file
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled || streaming}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
            aria-label="Attach image"
            title="Attach image (or paste one)"
          >
            <Icon name="paperclip" size={16} />
          </button>
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
            onPaste={(e) => {
              const files = imageFiles(e.clipboardData?.items ?? null)
              if (files.length) {
                e.preventDefault()
                void attach(files)
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
    </div>
  )
}
