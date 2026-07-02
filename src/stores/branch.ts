import { defineStore } from 'pinia'
import { listBranches, type BranchSummary } from '@/services/branch.api'

export type Branch = BranchSummary

interface BranchState {
  branches: Branch[]
  activeBranchId: string | null
  loaded: boolean
}

// Per-origin key. localStorage is scoped to the host (which carries the tenant subdomain),
// so a single key is already isolated per tenant.
const STORAGE_KEY = 'restaurante.activeBranchId'

function readPersisted(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writePersisted(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* storage unavailable (private mode / SSR): the selection just won't persist */
  }
}

// Selection priority: a still-valid persisted choice → the primary branch → the first branch.
// Returns null when the tenant has no branches.
function pickInitial(branches: Branch[], persisted: string | null): string | null {
  const first = branches[0]
  if (!first) return null
  if (persisted && branches.some((b) => b.id === persisted)) return persisted
  return (branches.find((b) => b.is_primary) ?? first).id
}

// Active-branch context shared by every branch-scoped screen. Branches are discovered via
// `GET /branches`, the active one defaults sensibly (primary → first), and the user's choice
// is persisted across reloads.
export const useBranchStore = defineStore('branch', {
  state: (): BranchState => ({
    branches: [],
    activeBranchId: null,
    loaded: false,
  }),

  getters: {
    hasActiveBranch: (state): boolean => state.activeBranchId !== null,
    hasMultipleBranches: (state): boolean => state.branches.length > 1,
    activeBranch: (state): Branch | null =>
      state.branches.find((b) => b.id === state.activeBranchId) ?? null,
  },

  actions: {
    // Idempotent: fetches the branch list once, then resolves the active branch. If the
    // request fails, `loaded` stays false so a later call retries.
    async ensureLoaded(): Promise<void> {
      if (this.loaded) return
      this.branches = await listBranches()
      this.activeBranchId = pickInitial(this.branches, readPersisted())
      this.loaded = true
    },

    setActiveBranch(id: string): void {
      if (!this.branches.some((b) => b.id === id)) return
      this.activeBranchId = id
      writePersisted(id)
    },
  },
})
