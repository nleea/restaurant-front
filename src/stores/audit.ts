import { defineStore } from 'pinia'
import * as api from '@/services/audit.api'
import type { AuditLog } from '@/services/audit.api'
import { listUsers } from '@/services/rbac.api'
import { useAuthStore } from '@/stores/auth'

// Filters in the API's field names (minus limit/offset, which the store owns).
interface AuditFilterState {
  action: string | null
  actor_id: string | null
  entity_type: string | null
  branch_id: string | null
}

interface AuditState {
  entries: AuditLog[]
  filters: AuditFilterState
  pageSize: number
  offset: number
  reachedEnd: boolean
  loading: boolean
  selectedId: string | null
  // actor_id → user name (best-effort, only when the viewer also has rbac.manage).
  actorIndex: Record<string, string>
  directoryLoaded: boolean
}

const EMPTY_FILTERS: AuditFilterState = {
  action: null,
  actor_id: null,
  entity_type: null,
  branch_id: null,
}

// Read-only audit viewer. Offset pagination with a reached-end heuristic (the endpoint returns a
// plain list with no total). Actor names are best-effort — resolved from /rbac/users only when the
// current user also holds rbac.manage, degrading to a short id otherwise.
export const useAuditStore = defineStore('audit', {
  state: (): AuditState => ({
    entries: [],
    filters: { ...EMPTY_FILTERS },
    pageSize: 50,
    offset: 0,
    reachedEnd: false,
    loading: false,
    selectedId: null,
    actorIndex: {},
    directoryLoaded: false,
  }),

  getters: {
    selectedEntry: (state): AuditLog | null =>
      state.entries.find((e) => e.id === state.selectedId) ?? null,

    actorName:
      (state) =>
      (actorId: string | null): string => {
        if (!actorId) return 'sistema'
        return state.actorIndex[actorId] ?? `#${actorId.slice(0, 8)}`
      },
  },

  actions: {
    // Best-effort: only viewers with rbac.manage can read the users directory for actor names.
    async loadActorDirectory(): Promise<void> {
      if (this.directoryLoaded) return
      if (!useAuthStore().can('rbac.manage')) return
      const users = await listUsers()
      this.actorIndex = Object.fromEntries(users.map((u) => [u.id, u.name || u.email]))
      this.directoryLoaded = true
    },

    // Apply filters and load the first page (resetting offset).
    async query(filters: Partial<AuditFilterState> = {}): Promise<void> {
      this.filters = { ...EMPTY_FILTERS, ...filters }
      this.loading = true
      try {
        const page = await api.listLogs({ ...this.filters, limit: this.pageSize, offset: 0 })
        this.entries = page
        this.offset = page.length
        this.reachedEnd = page.length < this.pageSize
      } finally {
        this.loading = false
      }
    },

    // Append the next page; mark reached-end when a short page returns.
    async loadMore(): Promise<void> {
      if (this.reachedEnd || this.loading) return
      this.loading = true
      try {
        const page = await api.listLogs({
          ...this.filters,
          limit: this.pageSize,
          offset: this.offset,
        })
        this.entries.push(...page)
        this.offset += page.length
        if (page.length < this.pageSize) this.reachedEnd = true
      } finally {
        this.loading = false
      }
    },

    select(id: string): void {
      this.selectedId = id
    },
  },
})
