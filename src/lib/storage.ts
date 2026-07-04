import { openDB, type IDBPDatabase } from 'idb'
import type { Agent, Chat, GeneratedImage, Settings } from './types'

const SETTINGS_KEY = 'dialogai:settings:v1'
const DB_NAME = 'dialogai'
// Bump this when adding a store; the idempotent upgrade() creates any missing
// one. (v3: some DBs were bumped to 3 by an earlier self-heal — match that so
// openDB doesn't fail trying to "downgrade" an existing v3 database.)
const DB_VERSION = 3

// ---------- Settings (localStorage: small, read synchronously at boot) ----------

export function defaultSettings(): Settings {
  return {
    version: 1,
    profiles: [],
    enabledProfileIds: [],
    ui: { sidebarCollapsed: false, theme: 'auto' },
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<Settings> & { activeProfileId?: string | null }
    if (parsed?.version !== 1) return defaultSettings()
    const merged = { ...defaultSettings(), ...parsed }
    // Migrate single active profile → multiple enabled profiles.
    if (!Array.isArray(parsed.enabledProfileIds)) {
      merged.enabledProfileIds = parsed.activeProfileId ? [parsed.activeProfileId] : []
    }
    return merged
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // quota exceeded / private mode — keep working in memory
  }
}

// ---------- Chats & agents (IndexedDB, with in-memory fallback) ----------

interface MemoryStores {
  chats: Map<string, Chat>
  agents: Map<string, Agent>
  images: Map<string, GeneratedImage>
}

let memory: MemoryStores | null = null
let dbPromise: Promise<IDBPDatabase | null> | null = null

const STORES = ['chats', 'agents', 'images'] as const

function upgrade(db: IDBPDatabase): void {
  for (const s of STORES) {
    if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
  }
}

function onBlocked(): void {
  console.warn(
    'IndexedDB upgrade is blocked by another open DialogAI tab. Close other tabs (or hard-reload) so saving works.',
  )
}

async function openDialogAI(): Promise<IDBPDatabase> {
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade, blocked: onBlocked })
  // If another tab opens a newer version, close ours so its upgrade can run.
  db.addEventListener('versionchange', () => db.close())
  return db
}

function getDb(): Promise<IDBPDatabase | null> {
  dbPromise ??= openDialogAI().catch((err) => {
    console.warn('IndexedDB unavailable — data will not persist across reloads.', err)
    memory = { chats: new Map(), agents: new Map(), images: new Map() }
    return null
  })
  return dbPromise
}

export async function isPersistent(): Promise<boolean> {
  return (await getDb()) !== null
}

export async function getAllChats(): Promise<Chat[]> {
  const db = await getDb()
  const chats: Chat[] = db ? await db.getAll('chats') : [...memory!.chats.values()]
  return chats.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getChat(id: string): Promise<Chat | undefined> {
  const db = await getDb()
  return db ? db.get('chats', id) : memory!.chats.get(id)
}

export async function putChat(chat: Chat): Promise<void> {
  const db = await getDb()
  if (db) await db.put('chats', chat)
  else memory!.chats.set(chat.id, chat)
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDb()
  if (db) await db.delete('chats', id)
  else memory!.chats.delete(id)
}

export async function getAllAgents(): Promise<Agent[]> {
  const db = await getDb()
  const agents: Agent[] = db ? await db.getAll('agents') : [...memory!.agents.values()]
  return agents.sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function putAgent(agent: Agent): Promise<void> {
  const db = await getDb()
  if (db) await db.put('agents', agent)
  else memory!.agents.set(agent.id, agent)
}

export async function putAgents(agents: Agent[]): Promise<void> {
  const db = await getDb()
  if (db) {
    const tx = db.transaction('agents', 'readwrite')
    await Promise.all([...agents.map((a) => tx.store.put(a)), tx.done])
  } else {
    for (const a of agents) memory!.agents.set(a.id, a)
  }
}

export async function deleteAgent(id: string): Promise<void> {
  const db = await getDb()
  if (db) await db.delete('agents', id)
  else memory!.agents.delete(id)
}

export async function getAllImages(): Promise<GeneratedImage[]> {
  const db = await getDb()
  const images: GeneratedImage[] = db ? await db.getAll('images') : [...memory!.images.values()]
  return images.sort((a, b) => b.createdAt - a.createdAt)
}

export async function putImage(image: GeneratedImage): Promise<void> {
  const db = await getDb()
  if (db) await db.put('images', image)
  else memory!.images.set(image.id, image)
}

export async function deleteImage(id: string): Promise<void> {
  const db = await getDb()
  if (db) await db.delete('images', id)
  else memory!.images.delete(id)
}

export async function clearStore(name: (typeof STORES)[number]): Promise<void> {
  const db = await getDb()
  if (db) await db.clear(name)
  else memory![name].clear()
}

// ---------- Backup: export / import all data ----------

export interface BackupData {
  app: 'dialogai'
  version: 1
  exportedAt: number
  settings: Settings
  chats: Chat[]
  agents: Agent[]
  images: GeneratedImage[]
}

export async function exportAll(): Promise<BackupData> {
  const [chats, agents, images] = await Promise.all([getAllChats(), getAllAgents(), getAllImages()])
  return {
    app: 'dialogai',
    version: 1,
    exportedAt: Date.now(),
    settings: loadSettings(),
    chats,
    agents,
    images,
  }
}

/** Replace all local data with the contents of a backup. */
export async function importAll(data: BackupData): Promise<void> {
  if (!data || !Array.isArray(data.chats) || !Array.isArray(data.agents)) {
    throw new Error('Invalid backup file.')
  }
  await Promise.all([clearStore('chats'), clearStore('agents'), clearStore('images')])
  for (const c of data.chats) await putChat(c)
  for (const a of data.agents) await putAgent(a)
  for (const img of data.images ?? []) await putImage(img)
  if (data.settings) saveSettings(data.settings)
}

// ---------- Storage usage breakdown ----------

export interface StorageBreakdown {
  chats: { count: number; bytes: number }
  agents: { count: number; bytes: number }
  images: { count: number; bytes: number }
  settings: { bytes: number }
  /** Sum of the categories above (estimated from serialized data). */
  totalBytes: number
  /** The browser's real origin usage/quota, when available. */
  estimate?: { usage: number; quota: number }
}

function byteSize(value: unknown): number {
  return new Blob([typeof value === 'string' ? value : JSON.stringify(value)]).size
}

export async function computeStorageBreakdown(): Promise<StorageBreakdown> {
  const [chats, agents, images] = await Promise.all([getAllChats(), getAllAgents(), getAllImages()])
  const settingsBytes = byteSize(localStorage.getItem(SETTINGS_KEY) ?? '')
  const chatBytes = byteSize(chats)
  const agentBytes = byteSize(agents)
  const imageBytes = byteSize(images)

  let estimate: { usage: number; quota: number } | undefined
  try {
    const est = await navigator.storage?.estimate?.()
    if (est && typeof est.usage === 'number') {
      estimate = { usage: est.usage, quota: est.quota ?? 0 }
    }
  } catch {
    // Storage estimate API unavailable
  }

  return {
    chats: { count: chats.length, bytes: chatBytes },
    agents: { count: agents.length, bytes: agentBytes },
    images: { count: images.length, bytes: imageBytes },
    settings: { bytes: settingsBytes },
    totalBytes: chatBytes + agentBytes + imageBytes + settingsBytes,
    estimate,
  }
}
