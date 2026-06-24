import { defineStore } from 'pinia'

export interface Branch {
  id: string
  name: string
}

interface BranchState {
  branches: Branch[]
  activeBranchId: string | null
  loaded: boolean
}

// Minimal branch context. The backend has a BranchModel but exposes NO branch-listing endpoint
// yet (branches exist only via the seed), so we cannot discover branches over the API. Until a
// real `GET /branches` lands, `ensureLoaded()` resolves the active branch from the
// VITE_DEFAULT_BRANCH_ID config seam (mirroring VITE_API_BASE_URL). Swapping in the real endpoint
// later means changing only this one function — panels just read `activeBranchId`.
export const useBranchStore = defineStore('branch', {
  state: (): BranchState => ({
    branches: [],
    activeBranchId: null,
    loaded: false,
  }),

  getters: {
    hasActiveBranch: (state): boolean => state.activeBranchId !== null,
  },

  actions: {
    ensureLoaded(): void {
      if (this.loaded) return
      const configured = import.meta.env.VITE_DEFAULT_BRANCH_ID
      if (configured) {
        this.branches = [{ id: configured, name: 'Sucursal principal' }]
        this.activeBranchId = configured
      }
      this.loaded = true
    },
  },
})
