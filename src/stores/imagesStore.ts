import { create } from 'zustand'
import type { GeneratedImage } from '../lib/types'
import * as storage from '../lib/storage'

interface ImagesState {
  /** Album, newest first. */
  images: GeneratedImage[]
  loaded: boolean
  loadAll: () => Promise<void>
  add: (images: GeneratedImage[]) => Promise<void>
  remove: (id: string) => Promise<void>
  clearAll: () => Promise<void>
}

export const useImagesStore = create<ImagesState>((set, get) => ({
  images: [],
  loaded: false,

  async loadAll() {
    if (get().loaded) return
    const images = await storage.getAllImages()
    set({ images, loaded: true })
  },

  async add(images) {
    set({ images: [...images, ...get().images] })
    await Promise.all(images.map((img) => storage.putImage(img)))
  },

  async remove(id) {
    set({ images: get().images.filter((img) => img.id !== id) })
    await storage.deleteImage(id)
  },

  async clearAll() {
    set({ images: [] })
    await storage.clearStore('images')
  },
}))
