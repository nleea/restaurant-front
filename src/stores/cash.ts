import { defineStore } from 'pinia'
import * as api from '@/services/cash.api'
import type {
  CashMovement,
  CashSession,
  CloseSessionInput,
  OpenSessionInput,
  RegisterMovementInput,
} from '@/services/cash.api'
import { statusOf } from '@/lib/apiError'

// Decimals travel as strings ("23900.00"); the only client-side arithmetic is the running
// expected cash, summed in integer cents so repeated parse/accumulate never drifts. The
// authoritative expected/difference always come from the server at close — this is guidance only.
function toCents(value: string | null | undefined): number {
  if (!value) return 0
  return Math.round(Number(value) * 100)
}
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

// Per-method ledger summary for the open session's drawer view.
export interface MethodTotals {
  method: string
  inTotal: string
  outTotal: string
}

interface CashState {
  // The active branch's open session (or none) and its movements.
  currentSession: CashSession | null
  currentMovements: CashMovement[]
  // The branch's session history and the currently inspected session's detail.
  history: CashSession[]
  selectedSessionId: string | null
  selectedSession: CashSession | null
  selectedMovements: CashMovement[]
}

// Write-through discipline (as in the orders/kitchen stores): every mutation calls the API then
// refetches the affected collection so the screen reflects server state verbatim. The single
// branch has at most one open session, so `currentSession` is the screen's spine.
export const useCashStore = defineStore('cash', {
  state: (): CashState => ({
    currentSession: null,
    currentMovements: [],
    history: [],
    selectedSessionId: null,
    selectedSession: null,
    selectedMovements: [],
  }),

  getters: {
    hasOpenSession: (state): boolean => state.currentSession !== null,

    // opening + Σ(cash in) − Σ(cash out), cash method only — mirrors the backend's drawer
    // reconciliation. Non-cash methods are excluded. Null when no session is open.
    runningExpectedCash: (state): string | null => {
      if (!state.currentSession) return null
      let cents = toCents(state.currentSession.opening_amount)
      for (const m of state.currentMovements) {
        if (m.method !== 'cash') continue
        const amount = toCents(m.amount)
        cents += m.type === 'in' ? amount : -amount
      }
      return fromCents(cents)
    },

    // Open session's movements summarised per method (so the ledger can show what's cash vs not).
    movementsByMethod: (state): MethodTotals[] => {
      const map = new Map<string, { in: number; out: number }>()
      for (const m of state.currentMovements) {
        const entry = map.get(m.method) ?? { in: 0, out: 0 }
        const amount = toCents(m.amount)
        if (m.type === 'in') entry.in += amount
        else entry.out += amount
        map.set(m.method, entry)
      }
      return [...map.entries()].map(([method, e]) => ({
        method,
        inTotal: fromCents(e.in),
        outTotal: fromCents(e.out),
      }))
    },
  },

  actions: {
    // Load the active branch's open session (tolerating 404-as-none) and its movements.
    async loadBranchCash(branchId: string): Promise<void> {
      try {
        this.currentSession = await api.getOpenSession(branchId)
      } catch (e) {
        if (statusOf(e) === 404) {
          this.currentSession = null
          this.currentMovements = []
          return
        }
        throw e
      }
      this.currentMovements = await api.listMovements(this.currentSession.id)
    },

    async loadHistory(branchId: string, status?: string): Promise<void> {
      this.history = await api.listSessions(branchId, status)
    },

    async selectSession(sessionId: string): Promise<void> {
      this.selectedSessionId = sessionId
      this.selectedSession = await api.getSession(sessionId)
      this.selectedMovements = await api.listMovements(sessionId)
    },

    // Apertura: open the drawer with a float; the screen switches to the active-session view.
    async openSession(input: OpenSessionInput): Promise<CashSession> {
      const session = await api.openSession(input)
      this.currentSession = session
      this.currentMovements = []
      return session
    },

    // Register an in/out movement on the open session; refetch so the ledger and running expected
    // cash reflect it.
    async registerMovement(input: RegisterMovementInput): Promise<void> {
      if (!this.currentSession) throw new Error('No hay una caja abierta.')
      await api.registerMovement(this.currentSession.id, input)
      this.currentMovements = await api.listMovements(this.currentSession.id)
    },

    // Arqueo: close with a counted amount. The server computes expected/difference; clear the open
    // session, refresh history, and surface the closed session in the detail pane for review.
    async closeSession(input: CloseSessionInput): Promise<CashSession> {
      if (!this.currentSession) throw new Error('No hay una caja abierta.')
      const closed = await api.closeSession(this.currentSession.id, input)
      this.currentSession = null
      this.currentMovements = []
      await this.loadHistory(closed.branch_id)
      await this.selectSession(closed.id)
      return closed
    },
  },
})
