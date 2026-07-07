import { defineStore } from 'pinia'
import * as api from '@/services/staff.api'
import type {
  Employee,
  PlannedShift,
  ShiftTemplate,
  TimeOffRequest,
} from '@/services/staff.api'

// Shift scheduling state for the /shifts board. The backend materializes every
// shift as a row (status = scheduled|day_off|covered|manual), so a calendar cell
// is simply "the shift for (employee, date)" or none — no client-side generation.
// Coverage lives on a *separate* row for the substitute, referencing the absentee
// via `covered_by_employee_id`.

interface DayCoverage {
  onDuty: number
  off: number
  uncovered: number
}

interface ShiftsState {
  branchId: string | null
  weekStart: string // yyyy-mm-dd (Monday)
  shifts: PlannedShift[]
  templates: ShiftTemplate[]
  requests: TimeOffRequest[]
  loading: boolean
  error: string | null
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y!, m! - 1, d! + n)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

export const useShiftsStore = defineStore('shifts', {
  state: (): ShiftsState => ({
    branchId: null,
    weekStart: '',
    shifts: [],
    templates: [],
    requests: [],
    loading: false,
    error: null,
  }),

  getters: {
    weekDays: (state): string[] =>
      Array.from({ length: 7 }, (_, i) => addDaysIso(state.weekStart, i)),

    // The single shift occupying an employee's slot on a date (or null).
    shiftFor:
      (state) =>
      (employeeId: string, dateIso: string): PlannedShift | null =>
        state.shifts.find(
          (s) => s.employee_id === employeeId && s.shift_date === dateIso,
        ) ?? null,

    // Coverage truth for a day, computed over every shift returned for the week.
    coverageFor:
      (state) =>
      (dateIso: string): DayCoverage => {
        const day = state.shifts.filter((s) => s.shift_date === dateIso)
        const coveredIds = new Set(
          day
            .filter((s) => s.status === 'covered' && s.covered_by_employee_id)
            .map((s) => s.covered_by_employee_id),
        )
        let onDuty = 0
        let off = 0
        let uncovered = 0
        for (const s of day) {
          if (s.status === 'day_off') {
            off++
            if (!coveredIds.has(s.employee_id)) uncovered++
          } else {
            onDuty++ // scheduled | manual | covered
          }
        }
        return { onDuty, off, uncovered }
      },

    pendingRequestCount: (state): number =>
      state.requests.filter((r) => r.status === 'pending').length,

    // Nearest horizon watermark across templates — used to warn before shifts run out.
    horizonEnd: (state): string | null => {
      const ends = state.templates
        .map((t) => t.generated_through)
        .filter((d): d is string => !!d)
      return ends.length ? ends.reduce((a, b) => (a < b ? a : b)) : null
    },
  },

  actions: {
    async loadWeek(branchId: string, weekStart: string): Promise<void> {
      this.branchId = branchId
      this.weekStart = weekStart
      this.loading = true
      this.error = null
      try {
        const to = addDaysIso(weekStart, 6)
        const [shifts, templates] = await Promise.all([
          api.listShiftsRange(branchId, weekStart, to),
          api.listTemplates(branchId),
        ])
        this.shifts = shifts
        this.templates = templates
      } catch {
        this.error = 'No se pudieron cargar los turnos.'
      } finally {
        this.loading = false
      }
    },

    async reload(): Promise<void> {
      if (this.branchId) await this.loadWeek(this.branchId, this.weekStart)
    },

    async loadRequests(status?: 'pending' | 'approved' | 'rejected'): Promise<void> {
      if (!this.branchId) return
      this.requests = await api.listTimeOffRequests({
        branchId: this.branchId,
        status,
      })
    },

    async availableCovers(dateIso: string): Promise<Employee[]> {
      if (!this.branchId) return []
      return api.listAvailableCovers(this.branchId, dateIso)
    },

    async createManual(
      employeeId: string,
      input: { shift_date: string; start_time: string; end_time: string; note?: string | null },
    ): Promise<void> {
      await api.createManualShift(employeeId, input)
      await this.reload()
    },

    async markDayOff(
      shiftId: string,
      reason: string,
      coverEmployeeId?: string | null,
    ): Promise<void> {
      await api.markDayOff(shiftId, reason, coverEmployeeId)
      await this.reload()
    },

    async assignCoverage(shiftId: string, coverEmployeeId: string): Promise<void> {
      await api.assignCoverage(shiftId, coverEmployeeId)
      await this.reload()
    },

    async editHours(shiftId: string, start: string, end: string): Promise<void> {
      await api.updateShift(shiftId, { start_time: start, end_time: end })
      await this.reload()
    },

    async removeShift(shiftId: string): Promise<void> {
      await api.deleteShift(shiftId)
      await this.reload()
    },

    async createRequest(employeeId: string, date: string, reason: string): Promise<void> {
      await api.createTimeOffRequest(employeeId, { request_date: date, reason })
      await this.loadRequests()
    },

    async approveRequest(requestId: string, coverEmployeeId?: string | null): Promise<void> {
      await api.approveTimeOffRequest(requestId, coverEmployeeId)
      await Promise.all([this.reload(), this.loadRequests()])
    },

    async rejectRequest(requestId: string, reason: string): Promise<void> {
      await api.rejectTimeOffRequest(requestId, reason)
      await this.loadRequests()
    },

    async saveTemplate(
      employeeId: string,
      input: {
        weekdays: number[]
        start_time: string
        end_time: string
        valid_from: string
        valid_until?: string | null
      },
    ): Promise<void> {
      await api.upsertTemplate(employeeId, input)
      await this.reload()
    },

    async extendHorizon(employeeId: string): Promise<void> {
      await api.extendHorizon(employeeId)
      await this.reload()
    },
  },
})
