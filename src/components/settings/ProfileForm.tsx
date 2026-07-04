import { useState, type ReactNode } from 'react'
import type { ConnectionProfile } from '../../lib/types'
import { errorMessage, fetchModels, normalizeBaseUrl } from '../../lib/api'
import { useSettingsStore } from '../../stores/settingsStore'
import ModelPicker from './ModelPicker'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-gray-300">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg bg-white/5 px-3 py-2 text-sm outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-white/25'

export default function ProfileForm({
  profile,
  onDone,
}: {
  profile?: ConnectionProfile
  onDone: () => void
}) {
  const saveProfile = useSettingsStore((s) => s.saveProfile)

  const [name, setName] = useState(profile?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? '')
  const [apiKey, setApiKey] = useState(profile?.apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [defaultModel, setDefaultModel] = useState(profile?.defaultModel ?? '')
  const [models, setModels] = useState<string[]>(profile?.models ?? [])
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [fetchError, setFetchError] = useState('')

  const canSave = name.trim() && baseUrl.trim() && defaultModel.trim()

  async function handleFetchModels() {
    setFetchState('loading')
    setFetchError('')
    try {
      const list = await fetchModels({ baseUrl: normalizeBaseUrl(baseUrl), apiKey })
      setModels(list)
      setFetchState('ok')
    } catch (err) {
      setFetchState('error')
      setFetchError(errorMessage(err))
    }
  }

  function handleSave() {
    if (!canSave) return
    saveProfile({
      id: profile?.id,
      name: name.trim(),
      baseUrl,
      apiKey,
      defaultModel: defaultModel.trim(),
      models: models.length > 0 ? models : undefined,
    })
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ollama local"
          className={inputClass}
          autoFocus
        />
      </Field>

      <Field label="Base URL">
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434 (with or without /v1)"
          className={inputClass}
        />
      </Field>

      <Field label="API key / password">
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Leave empty for Ollama"
            className={inputClass}
          />
          <button
            onClick={() => setShowKey((s) => !s)}
            className="shrink-0 rounded-lg bg-white/5 px-3 text-xs text-gray-400 ring-1 ring-white/10 hover:bg-white/10"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </Field>

      <Field label="Default model">
        <div className="flex flex-col gap-2">
          <ModelPicker models={models} value={defaultModel} onChange={setDefaultModel} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleFetchModels()}
              disabled={!baseUrl.trim() || fetchState === 'loading'}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-300 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              {fetchState === 'loading' ? 'Fetching…' : 'Fetch models'}
            </button>
            {fetchState === 'ok' && (
              <span className="text-xs text-accent">{models.length} models found</span>
            )}
          </div>
          {fetchState === 'error' && (
            <p className="text-xs text-red-400">{fetchError} You can type the model manually.</p>
          )}
        </div>
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onDone}
          className="rounded-full px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  )
}
