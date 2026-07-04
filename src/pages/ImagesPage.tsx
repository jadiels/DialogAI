import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import type { GeneratedImage } from '../lib/types'
import { enabledProfiles, useSettingsStore } from '../stores/settingsStore'
import { useImagesStore } from '../stores/imagesStore'
import { errorMessage, generateImage, isAbortError } from '../lib/api'
import { classifyModel } from '../lib/modelKind'
import { EmptyState } from '../components/ui/EmptyState'
import GroupedModelPicker from '../components/settings/GroupedModelPicker'
import { Icon } from '../components/ui/icons'

const SIZES = ['1024x1024', '512x512', '256x256', '1792x1024', '1024x1792']

export default function ImagesPage() {
  const settings = useSettingsStore((s) => s.settings)
  const setImageModel = useSettingsStore((s) => s.setImageModel)
  const refreshModels = useSettingsStore((s) => s.refreshModels)
  const enabled = useMemo(() => enabledProfiles(settings), [settings])

  const images = useImagesStore((s) => s.images)
  const addImages = useImagesStore((s) => s.add)
  const removeImage = useImagesStore((s) => s.remove)
  useEffect(() => {
    void useImagesStore.getState().loadAll()
  }, [])
  const [viewing, setViewing] = useState<GeneratedImage | null>(null)

  // Image-classified models across enabled connections, grouped by connection.
  const imageGroups = useMemo(
    () =>
      enabled
        .map((p) => ({
          id: p.id,
          name: p.name,
          models: p.models.filter((m) => classifyModel(m) === 'image'),
        }))
        .filter((g) => g.models.length > 0),
    [enabled],
  )
  const hasImageModels = imageGroups.length > 0

  const [model, setModel] = useState(
    settings.imageModel ?? imageGroups[0]?.models[0] ?? '',
  )
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [count, setCount] = useState(1)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const abort = useRef<AbortController | null>(null)

  const profileForModel = (m: string) =>
    enabled.find((p) => p.models.includes(m)) ?? enabled[0] ?? null

  async function refreshAll() {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError('')
    try {
      await Promise.all(enabled.map((p) => refreshModels(p.id)))
    } catch (err) {
      setRefreshError(errorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }

  async function generate() {
    const target = model.trim()
    const profile = profileForModel(target)
    if (!target || !profile || !prompt.trim() || busy) return
    const controller = new AbortController()
    abort.current = controller
    setBusy(true)
    setError('')
    const promptText = prompt.trim()
    try {
      const srcs = await generateImage(
        { baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: target, prompt: promptText, size, n: count },
        controller.signal,
      )
      const now = Date.now()
      const created: GeneratedImage[] = srcs.map((src, i) => ({
        id: nanoid(),
        src,
        prompt: promptText,
        model: target,
        size,
        connectionName: profile.name,
        createdAt: now + i,
      }))
      await addImages(created)
    } catch (err) {
      if (!isAbortError(err)) setError(errorMessage(err))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  if (!enabled.length) {
    return (
      <EmptyState
        icon="image"
        title="No connection configured"
        description="Enable a connection that offers an image model to generate images."
        action={
          <Link
            to="/settings"
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
          >
            Open Settings
          </Link>
        }
      />
    )
  }

  const inputClass =
    'rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-white/25'
  // Native selects: force dark option popups (some browsers render them light
  // when the control has a translucent background).
  const selectClass = `${inputClass} bg-elevated text-gray-200 [&>option]:bg-elevated [&>option]:text-gray-200`

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold">Images</h1>
        <p className="text-sm text-gray-500">
          Generate images with an image model from your enabled connections (OpenAI-compatible{' '}
          <code className="text-gray-400">/v1/images/generations</code>).
        </p>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 p-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <GroupedModelPicker
                groups={imageGroups}
                value={model}
                onChange={setModel}
                placeholder="Image model (e.g. dall-e-3)"
              />
            </div>
            <button
              onClick={() => void refreshAll()}
              disabled={!enabled.length || refreshing}
              className="shrink-0 rounded-lg bg-white/5 p-2 text-gray-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-gray-200 disabled:opacity-50"
              aria-label="Refresh models from all connections"
              title="Refresh models from all enabled connections"
            >
              <Icon name="refresh" size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex gap-2">
            <select value={size} onChange={(e) => setSize(e.target.value)} className={selectClass}>
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className={selectClass}
              aria-label="Number of images"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} image{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>

          {refreshError && <p className="text-xs text-red-400">{refreshError}</p>}
          {!hasImageModels && (
            <p className="text-xs text-gray-500">
              No image models detected in your connections. Type a model name above, refresh, or set a
              default in Settings. (Model types are guessed from the name — the API doesn’t report
              them.)
            </p>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void generate()
            }}
            rows={3}
            placeholder="Describe the image…  (Cmd/Ctrl+Enter to generate)"
            className={`resize-y ${inputClass}`}
          />

          <div className="flex items-center gap-3">
            <button
              onClick={() => void generate()}
              disabled={busy || !prompt.trim() || !model.trim()}
              className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="image" size={15} />}
              {busy ? 'Generating…' : 'Generate'}
            </button>
            {busy && (
              <button
                onClick={() => abort.current?.abort()}
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
            )}
            {model.trim() && (
              <button
                onClick={() => setImageModel(model.trim())}
                className="ml-auto text-xs text-gray-500 hover:text-gray-300"
                title="Save this model as the default in Settings"
              >
                Set “{model.trim()}” as default
              </button>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {images.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 text-sm font-medium text-gray-400">Album</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setViewing(img)}
                  className="block overflow-hidden rounded-xl border border-white/10 hover:border-white/25"
                  title={img.prompt}
                >
                  <img
                    src={img.src}
                    alt={img.prompt}
                    className="aspect-square w-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {viewing && (
        <ImageViewer
          image={viewing}
          onClose={() => setViewing(null)}
          onDelete={() => {
            if (confirm('Delete this image? This cannot be undone.')) {
              void removeImage(viewing.id)
              setViewing(null)
            }
          }}
        />
      )}
    </div>
  )
}

function ImageViewer({
  image,
  onClose,
  onDelete,
}: {
  image: GeneratedImage
  onClose: () => void
  onDelete: () => void
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-elevated shadow-xl md:flex-row">
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-2">
          <img
            src={image.src}
            alt={image.prompt}
            className="max-h-[60vh] w-auto max-w-full object-contain md:max-h-[92vh]"
          />
        </div>
        <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto p-4 md:w-72">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-200">Image details</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-gray-100"
              aria-label="Close"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <div>
            <div className="mb-1 text-xs text-gray-500">Prompt</div>
            <p className="whitespace-pre-wrap text-sm text-gray-200">{image.prompt}</p>
          </div>

          <dl className="flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Model</dt>
              <dd className="truncate text-gray-200">{image.model}</dd>
            </div>
            {image.connectionName && (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Connection</dt>
                <dd className="truncate text-gray-200">{image.connectionName}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Size</dt>
              <dd className="text-gray-200">{image.size}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Generated</dt>
              <dd className="text-gray-200">{new Date(image.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          <div className="mt-auto flex gap-2 pt-2">
            <a
              href={image.src}
              download={`dialogai-${image.id}.png`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
            >
              <Icon name="download" size={15} />
              Download
            </a>
            <button
              onClick={onDelete}
              className="flex items-center justify-center gap-1.5 rounded-full bg-white/5 px-3 py-2 text-sm text-red-400 ring-1 ring-white/10 hover:bg-white/10"
              aria-label="Delete image"
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
