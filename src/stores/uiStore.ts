import { create } from 'zustand'

/** Ephemeral UI state — the mobile sidebar drawer (not persisted). */
interface UiState {
  sidebarOpen: boolean
  openSidebar: () => void
  closeSidebar: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
}))
