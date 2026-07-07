import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ConnectionProfile } from '../lib/types'
import { activeProfile, enabledProfiles, useSettingsStore } from '../stores/settingsStore'
import { useChatsStore } from '../stores/chatsStore'
import { useAgentsStore } from '../stores/agentsStore'
import { useImagesStore } from '../stores/imagesStore'
import { errorMessage, pingProfile } from '../lib/api'
import {
  computeStorageBreakdown,
  exportAll,
  importAll,
  type BackupData,
  type StorageBreakdown,
} from '../lib/storage'
import { classifyModel } from '../lib/modelKind'
import ProfileForm from '../components/settings/ProfileForm'
import ModelPicker from '../components/settings/ModelPicker'
import SamplingFields from '../components/settings/SamplingFields'
import GroupedModelPicker from '../components/settings/GroupedModelPicker'
import { Modal } from '../components/ui/Modal'
import { Menu } from '../components/ui/Menu'
import { Icon } from '../components/ui/icons'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(1)} ${units[i]}`
}

type ConnStatus = 'checking' | 'online' | 'offline'

function StatusDot({ status, onClick }: { status: ConnStatus | undefined; onClick: () => void }) {
  const color =
    status === 'online'
      ? 'bg-green-500'
      : status === 'offline'
        ? 'bg-red-500'
        : 'bg-gray-500 animate-pulse'
  const label =
    status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking…'
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs text-gray-500 hover:bg-white/10"
      title={`${label} — click to re-check`}
      aria-label={`Connection status: ${label}. Re-check.`}
    >
      <span className={`size-2 rounded-full ${color}`} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function ConnectionRow({
  profile,
  enabled,
  primary,
  status,
  onRecheck,
  onToggle,
  onEdit,
  onDelete,
}: {
  profile: ConnectionProfile
  enabled: boolean
  primary: boolean
  status: ConnStatus | undefined
  onRecheck: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: profile.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border p-3.5 ${
        enabled ? 'border-accent/50 bg-accent/5' : 'border-white/10'
      } ${isDragging ? 'z-10 opacity-70 shadow-2xl' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-gray-200 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <Icon name="grip" size={16} />
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          enabled ? 'bg-accent' : 'bg-white/15'
        }`}
        aria-label={`${enabled ? 'Disable' : 'Enable'} ${profile.name}`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-[#fff] transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-gray-200">{profile.name}</span>
          {primary && (
            <span className="rounded-full bg-accent/20 px-1.5 text-xs font-medium text-accent">
              primary
            </span>
          )}
        </div>
        <div className="truncate text-sm text-gray-500">
          {profile.baseUrl} · {profile.defaultModel}
          {profile.models.length > 0 && ` · ${profile.models.length} models`}
        </div>
      </div>
      <StatusDot status={status} onClick={onRecheck} />
      <Menu
        button={<Icon name="dots" size={16} />}
        items={[
          { label: 'Edit', icon: 'edit', onClick: onEdit },
          { label: 'Delete', icon: 'trash', danger: true, onClick: onDelete },
        ]}
      />
    </div>
  )
}

export default function SettingsPage() {
  const settings = useSettingsStore((s) => s.settings)
  const toggleProfileEnabled = useSettingsStore((s) => s.toggleProfileEnabled)
  const reorderProfiles = useSettingsStore((s) => s.reorderProfiles)
  const deleteProfile = useSettingsStore((s) => s.deleteProfile)
  const setTitleModel = useSettingsStore((s) => s.setTitleModel)
  const setImageModel = useSettingsStore((s) => s.setImageModel)
  const setSampling = useSettingsStore((s) => s.setSampling)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const theme = settings.ui.theme ?? 'auto'
  const resetSettings = useSettingsStore((s) => s.reset)
  const refreshModels = useSettingsStore((s) => s.refreshModels)
  const clearChats = useChatsStore((s) => s.clearAll)
  const clearAgents = useAgentsStore((s) => s.clearAll)
  const clearImages = useImagesStore((s) => s.clearAll)

  async function clearCategory(confirmMsg: string, action: () => Promise<void> | void) {
    if (!confirm(confirmMsg)) return
    await action()
    setStorage(await computeStorageBreakdown())
  }
  const [editing, setEditing] = useState<ConnectionProfile | 'new' | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [refreshCount, setRefreshCount] = useState<number | null>(null)
  const [storage, setStorage] = useState<StorageBreakdown | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ConnStatus>>({})
  const [imgRefreshing, setImgRefreshing] = useState(false)
  const [imgRefreshError, setImgRefreshError] = useState('')
  const [backupError, setBackupError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const active = activeProfile(settings)

  async function handleExport() {
    setBackupError('')
    try {
      const data = await exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dialogai-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setBackupError(errorMessage(err))
    }
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setBackupError('')
    try {
      const data = JSON.parse(await file.text()) as BackupData
      if (
        !confirm(
          'Import this backup? It will REPLACE all current chats, agents, images and settings.',
        )
      )
        return
      await importAll(data)
      location.reload()
    } catch (err) {
      setBackupError(errorMessage(err))
    }
  }

  // Image models across all enabled connections, grouped by connection.
  const imageGroups = enabledProfiles(settings)
    .map((p) => ({
      id: p.id,
      name: p.name,
      models: p.models.filter((m) => classifyModel(m) === 'image'),
    }))
    .filter((g) => g.models.length > 0)

  async function refreshAllModels() {
    if (imgRefreshing) return
    setImgRefreshing(true)
    setImgRefreshError('')
    try {
      await Promise.all(enabledProfiles(settings).map((p) => refreshModels(p.id)))
    } catch (err) {
      setImgRefreshError(errorMessage(err))
    } finally {
      setImgRefreshing(false)
    }
  }

  async function checkStatus(profile: ConnectionProfile) {
    setStatuses((s) => ({ ...s, [profile.id]: 'checking' }))
    const online = await pingProfile(profile)
    setStatuses((s) => ({ ...s, [profile.id]: online ? 'online' : 'offline' }))
  }

  // Re-check whenever a connection's id / URL / key changes.
  const profilesKey = settings.profiles.map((p) => `${p.id}:${p.baseUrl}:${p.apiKey}`).join('|')
  useEffect(() => {
    let cancelled = false
    settings.profiles.forEach(async (p) => {
      setStatuses((s) => ({ ...s, [p.id]: 'checking' }))
      const online = await pingProfile(p)
      if (!cancelled) setStatuses((s) => ({ ...s, [p.id]: online ? 'online' : 'offline' }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesKey])

  useEffect(() => {
    void computeStorageBreakdown().then(setStorage).catch(() => {})
  }, [settings])

  async function refreshPrimaryModels() {
    if (!active || refreshing) return
    setRefreshing(true)
    setRefreshError('')
    setRefreshCount(null)
    try {
      const models = await refreshModels(active.id)
      setRefreshCount(models.length)
    } catch (err) {
      setRefreshError(errorMessage(err))
    } finally {
      setRefreshing(false)
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active: a, over } = event
    if (over && a.id !== over.id) reorderProfiles(String(a.id), String(over.id))
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-xl font-semibold">Settings</h1>

        <section className="mt-6">
          <h2 className="font-medium text-gray-200">Appearance</h2>
          <p className="text-sm text-gray-500">
            Theme. “Auto” follows your system setting. “Nebula” is a neon accent theme.
          </p>
          <div className="mt-3 inline-flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
            {(['auto', 'light', 'dark', 'nebula'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`rounded-md px-4 py-1.5 text-sm capitalize ${
                  theme === t
                    ? 'bg-elevated text-gray-100 shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-gray-200">Connections</h2>
              <p className="text-sm text-gray-500">
                OpenAI-compatible APIs (OpenAI, Ollama, LM Studio, vLLM…). Enable one or more — their
                models all appear in the chat selector, in this order. Drag to reorder.
              </p>
            </div>
            <button
              onClick={() => setEditing('new')}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
            >
              <Icon name="plus" size={15} />
              Add
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {settings.profiles.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-gray-500">
                No connections yet. Add one to start chatting — for local Ollama use{' '}
                <code className="text-gray-400">http://localhost:11434</code> and leave the key
                empty.
              </p>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={settings.profiles.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {settings.profiles.map((profile) => (
                  <ConnectionRow
                    key={profile.id}
                    profile={profile}
                    enabled={settings.enabledProfileIds.includes(profile.id)}
                    primary={profile.id === active?.id}
                    status={statuses[profile.id]}
                    onRecheck={() => void checkStatus(profile)}
                    onToggle={() => toggleProfileEnabled(profile.id)}
                    onEdit={() => setEditing(profile)}
                    onDelete={() => {
                      if (confirm(`Delete connection "${profile.name}"?`)) deleteProfile(profile.id)
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-gray-200">Chat titles</h2>
            {active && (
              <span className="text-xs text-gray-500">· models from {active.name} (primary)</span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Global default model used by “Regenerate title” in the chat menu. Leave empty to use the
            chat connection’s default model{active ? ` (e.g. ${active.defaultModel})` : ''}.
          </p>
          <div className="mt-3 flex max-w-sm items-center gap-2">
            <div className="min-w-0 flex-1">
              <ModelPicker
                models={active?.models ?? []}
                value={settings.titleModel ?? ''}
                onChange={setTitleModel}
                placeholder={
                  active ? `Default: ${active.defaultModel}` : 'Enable a connection first'
                }
              />
            </div>
            <button
              onClick={() => void refreshPrimaryModels()}
              disabled={!active || refreshing}
              className="shrink-0 rounded-lg bg-white/5 p-2 text-gray-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-gray-200 disabled:opacity-50"
              aria-label="Refresh primary connection models"
              title="Refresh models from the primary connection"
            >
              <Icon name="refresh" size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          {refreshError && <p className="mt-1 text-xs text-red-400">{refreshError}</p>}
          {refreshCount !== null && !refreshError && (
            <p className="mt-1 text-xs text-accent">
              {refreshCount} {refreshCount === 1 ? 'model' : 'models'} found
            </p>
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-medium text-gray-200">Image generation</h2>
          <p className="text-sm text-gray-500">
            Default model for the Images page — image models from all enabled connections, grouped by
            connection. Types are guessed from the name (the API doesn’t report them).
          </p>
          <div className="mt-3 flex max-w-sm items-center gap-2">
            <div className="min-w-0 flex-1">
              <GroupedModelPicker
                groups={imageGroups}
                value={settings.imageModel ?? ''}
                onChange={setImageModel}
                placeholder={active ? 'e.g. dall-e-3' : 'Enable a connection first'}
              />
            </div>
            <button
              onClick={() => void refreshAllModels()}
              disabled={!active || imgRefreshing}
              className="shrink-0 rounded-lg bg-white/5 p-2 text-gray-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-gray-200 disabled:opacity-50"
              aria-label="Refresh models from all connections"
              title="Refresh models from all enabled connections"
            >
              <Icon name="refresh" size={15} className={imgRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
          {imgRefreshError && <p className="mt-1 text-xs text-red-400">{imgRefreshError}</p>}
        </section>

        <section className="mt-10">
          <h2 className="font-medium text-gray-200">Generation defaults</h2>
          <p className="text-sm text-gray-500">
            Default sampling parameters sent with every chat completion. Leave a field empty to use
            the provider&apos;s default. Agents and individual chats can override each field.
          </p>
          <div className="mt-3 max-w-lg">
            <SamplingFields value={settings.sampling ?? {}} onChange={setSampling} />
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-medium text-gray-200">Backup &amp; restore</h2>
          <p className="text-sm text-gray-500">
            Export all your data (chats, agents, images and settings) to a JSON file, or restore
            from a previous backup. Importing replaces everything currently stored.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void handleExport()}
              className="flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:opacity-90"
            >
              <Icon name="download" size={15} />
              Export data
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full bg-white/5 px-4 py-2 text-sm text-gray-200 ring-1 ring-white/10 hover:bg-white/10"
            >
              <Icon name="upload" size={15} />
              Import backup
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void handleImport(e)}
            />
          </div>
          {backupError && <p className="mt-1 text-xs text-red-400">{backupError}</p>}
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2">
            <h2 className="font-medium text-gray-200">Storage usage</h2>
            <button
              onClick={() => void computeStorageBreakdown().then(setStorage)}
              className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-gray-200"
              aria-label="Recalculate storage usage"
              title="Recalculate"
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
          <p className="text-sm text-gray-500">
            Everything is stored locally in your browser (IndexedDB + localStorage). Nothing is sent
            anywhere except to the API you configure.
          </p>

          {storage && (
            <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-white/10 text-sm">
              {(
                [
                  {
                    label: 'Chats',
                    count: storage.chats.count,
                    bytes: storage.chats.bytes,
                    onClear: () =>
                      clearCategory('Delete ALL chats? This cannot be undone.', clearChats),
                  },
                  {
                    label: 'Agents',
                    count: storage.agents.count,
                    bytes: storage.agents.bytes,
                    onClear: () =>
                      clearCategory('Delete ALL agents? This cannot be undone.', clearAgents),
                  },
                  {
                    label: 'Images',
                    count: storage.images.count,
                    bytes: storage.images.bytes,
                    onClear: () =>
                      clearCategory('Delete ALL generated images? This cannot be undone.', clearImages),
                  },
                  {
                    label: 'Settings',
                    count: null,
                    bytes: storage.settings.bytes,
                    onClear: () =>
                      clearCategory(
                        'Reset ALL settings? This removes every connection and preference.',
                        resetSettings,
                      ),
                  },
                ] as { label: string; count: number | null; bytes: number; onClear: () => void }[]
              ).map((row) => (
                <div
                  key={row.label}
                  className="flex items-center gap-2 border-b border-white/5 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-gray-300">
                    {row.label}
                    {row.count !== null && <span className="text-gray-500"> · {row.count}</span>}
                  </span>
                  <span className="tabular-nums text-gray-200">{formatBytes(row.bytes)}</span>
                  <button
                    onClick={() => void row.onClear()}
                    disabled={row.bytes === 0 || (row.count !== null && row.count === 0)}
                    className="rounded-lg p-1 text-gray-500 hover:bg-white/10 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                    aria-label={`Clear ${row.label}`}
                    title={`Clear ${row.label}`}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 font-medium text-gray-200">
                  App data (estimated)
                </span>
                <span className="font-medium tabular-nums text-gray-100">
                  {formatBytes(storage.totalBytes)}
                </span>
                {/* spacer matching the trash button so values line up */}
                <span className="invisible p-1" aria-hidden="true">
                  <Icon name="trash" size={14} />
                </span>
              </div>
            </div>
          )}

          {storage?.estimate && storage.estimate.quota > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Browser reports {formatBytes(storage.estimate.usage)} used of{' '}
              {formatBytes(storage.estimate.quota)} available for this site (
              {((storage.estimate.usage / storage.estimate.quota) * 100).toFixed(1)}%). The per-item
              sizes above are estimated from the stored data.
            </p>
          )}
        </section>
      </div>

      {editing && (
        <Modal
          title={editing === 'new' ? 'Add connection' : 'Edit connection'}
          onClose={() => setEditing(null)}
        >
          <ProfileForm
            profile={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  )
}
