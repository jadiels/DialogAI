import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { beforeAll, describe, expect, it } from 'vitest'
import { getAllImages, putImage, deleteImage, getAllChats } from './storage'
import type { GeneratedImage } from './types'

// Simulate a user who already had a v1 database (chats/agents, no images store)
// before the image-album feature bumped the schema to v2.
beforeAll(async () => {
  const db = await openDB('dialogai', 1, {
    upgrade(d) {
      d.createObjectStore('chats', { keyPath: 'id' })
      d.createObjectStore('agents', { keyPath: 'id' })
    },
  })
  await db.put('chats', {
    id: 'c1',
    title: 'old chat',
    model: 'm',
    rootId: 'r',
    currentLeafId: 'r',
    nodes: {},
    createdAt: 1,
    updatedAt: 1,
  })
  db.close()
})

function img(id: string): GeneratedImage {
  return {
    id,
    src: `data:image/png;base64,${id}`,
    prompt: 'a cat',
    model: 'dall-e-3',
    size: '1024x1024',
    connectionName: 'OpenAI',
    createdAt: Number(id.replace(/\D/g, '')) || 1,
  }
}

describe('image album persistence (v1 → v2 upgrade)', () => {
  it('creates the images store on upgrade and keeps existing chats', async () => {
    const chats = await getAllChats() // opens at v2, runs the upgrade
    expect(chats.map((c) => c.id)).toContain('c1')
  })

  it('persists an image and reloads it (survives a fresh getAll = page refresh)', async () => {
    await putImage(img('1'))
    const all = await getAllImages()
    const found = all.find((i) => i.id === '1')
    expect(found).toBeDefined()
    expect(found?.src).toBe('data:image/png;base64,1')
    expect(found?.prompt).toBe('a cat')
  })

  it('sorts newest first and deletes', async () => {
    await putImage(img('10'))
    await putImage(img('20'))
    let all = await getAllImages()
    expect(all[0].id).toBe('20') // createdAt 20 > 10 > 1
    await deleteImage('20')
    all = await getAllImages()
    expect(all.find((i) => i.id === '20')).toBeUndefined()
  })
})
