<script setup lang="ts">
// Mi horario — the employee's own read-only weekly schedule + day-off requests.
// Uses the authenticated-only "me" endpoints, so any employee reaches it without
// staff.read/manage. Name comes from the auth session; only the current user's own
// shifts are ever fetched.
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import * as api from '@/services/staff.api'
import type { PlannedShift } from '@/services/staff.api'

const auth = useAuthStore()

const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}
function dateToIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function addDaysIso(iso: string, n: number): string {
  const d = isoToDate(iso)
  d.setDate(d.getDate() + n)
  return dateToIso(d)
}
function startOfWeekMonIso(iso: string): string {
  const d = isoToDate(iso)
  const dow = d.getDay()
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return dateToIso(d)
}
function hm(t: string): string {
  return t.slice(0, 5)
}
function toMin(t: string): number {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

const todayIso = dateToIso(new Date())
const name = computed(() => auth.user?.name || auth.user?.email || 'Mi horario')
const myInitials = computed(() => {
  const parts = name.value.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·'
})

// ── Data (all my shifts, once) ─────────────────────────────────────────────────
const shifts = ref<PlannedShift[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const noEmployee = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    await api.getMyEmployee()
    shifts.value = await api.listMyShifts()
  } catch (e) {
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 404) noEmployee.value = true
    else error.value = 'No se pudo cargar tu horario.'
  } finally {
    loading.value = false
  }
}
onMounted(load)

function shiftOn(iso: string): PlannedShift | null {
  return shifts.value.find((s) => s.shift_date === iso) ?? null
}

// ── Week model ─────────────────────────────────────────────────────────────────
const weekStart = ref(startOfWeekMonIso(todayIso))
const isThisWeek = computed(() => weekStart.value === startOfWeekMonIso(todayIso))
function shiftWeek(n: number) {
  weekStart.value = addDaysIso(weekStart.value, n * 7)
}
function goThisWeek() {
  weekStart.value = startOfWeekMonIso(todayIso)
}

interface DayRow {
  iso: string
  label: string
  isToday: boolean
  shift: PlannedShift | null
}
function weekRows(startIso: string): DayRow[] {
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(startIso, i)
    const d = isoToDate(iso)
    return {
      iso,
      label: `${DOW_LONG[d.getDay()]} ${d.getDate()}`,
      isToday: iso === todayIso,
      shift: shiftOn(iso),
    }
  })
}
const currentWeek = computed(() => weekRows(weekStart.value))
const weekRangeLabel = computed(() => {
  const a = isoToDate(weekStart.value)
  const b = isoToDate(addDaysIso(weekStart.value, 6))
  return `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
})
function weekHours(rows: DayRow[]): number {
  let min = 0
  for (const r of rows) {
    if (r.shift && r.shift.status !== 'day_off') min += toMin(r.shift.end_time) - toMin(r.shift.start_time)
  }
  return Math.round(min / 60)
}

// Next 4 weeks for the accordion.
const upcoming = computed(() =>
  Array.from({ length: 4 }, (_, i) => {
    const start = addDaysIso(weekStart.value, (i + 1) * 7)
    return { start, rows: weekRows(start) }
  }),
)
const openWeek = ref<string | null>(null)
function toggleWeek(start: string) {
  openWeek.value = openWeek.value === start ? null : start
}

// A day's presentation.
type DayKind = 'work' | 'cover' | 'off' | 'rest'
function dayKind(shift: PlannedShift | null): DayKind {
  if (!shift) return 'rest'
  if (shift.status === 'day_off') return 'off'
  if (shift.status === 'covered') return 'cover'
  return 'work'
}

// ── Request a day off ──────────────────────────────────────────────────────────
const reqOpen = ref(false)
const reqDate = ref(todayIso)
const reqReason = ref('Descanso')
const reqBusy = ref(false)
const reqDone = ref(false)
const MOTIVOS = ['Descanso', 'Cita médica', 'Permiso personal', 'Vacaciones', 'Otro'].map((m) => ({ label: m, value: m }))
function openReq() {
  reqDate.value = todayIso
  reqReason.value = 'Descanso'
  reqDone.value = false
  reqOpen.value = true
}
async function sendReq() {
  reqBusy.value = true
  error.value = null
  try {
    await api.createMyTimeOffRequest({ request_date: reqDate.value, reason: reqReason.value })
    reqDone.value = true
    setTimeout(() => (reqOpen.value = false), 1200)
  } catch {
    error.value = 'No se pudo enviar la solicitud.'
  } finally {
    reqBusy.value = false
  }
}
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Header -->
        <header class="flex items-center gap-3">
          <span class="grid size-11 shrink-0 place-items-center rounded-full bg-graphite-800 font-mono text-sm font-bold text-paper">{{ myInitials }}</span>
          <div class="min-w-0 flex-1">
            <p class="eyebrow">Mi horario</p>
            <h1 class="truncate text-xl font-extrabold text-ink">{{ name }}</h1>
          </div>
          <Button label="Solicitar día libre" icon="pi pi-moon" size="small" @click="openReq" />
        </header>

        <p v-if="error" class="pill pill-alert self-start">{{ error }}</p>

        <div v-if="loading" class="card grid place-items-center py-20 text-steel-500"><i class="pi pi-spin pi-spinner text-2xl" /></div>

        <div v-else-if="noEmployee" class="card grid place-items-center px-6 py-16 text-center text-sm text-steel-500">
          <span class="mb-2 grid size-11 place-items-center rounded-xl bg-sunken text-steel-400"><i class="pi pi-user text-lg" /></span>
          Tu usuario aún no está vinculado a un empleado. Pídele a un administrador que te registre en Personal.
        </div>

        <template v-else>
          <!-- Week nav -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1 rounded-xl border border-line bg-paper p-1">
              <button type="button" aria-label="Semana anterior" class="grid size-8 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink" @click="shiftWeek(-1)"><i class="pi pi-chevron-left text-xs" /></button>
              <div class="flex flex-col items-center px-2 leading-tight">
                <span class="font-mono text-[13px] font-bold tabular-nums text-ink">{{ weekRangeLabel }}</span>
                <button type="button" class="font-mono text-[10px] uppercase tracking-[0.12em] transition" :class="isThisWeek ? 'text-ember' : 'text-steel-400 hover:text-ember'" @click="goThisWeek">{{ isThisWeek ? 'Esta semana' : 'Ir a hoy' }}</button>
              </div>
              <button type="button" aria-label="Semana siguiente" class="grid size-8 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink" @click="shiftWeek(1)"><i class="pi pi-chevron-right text-xs" /></button>
            </div>
            <span class="font-mono text-[12px] text-steel-500">Total: <b class="text-ink tabular-nums">{{ weekHours(currentWeek) }}h</b></span>
          </div>

          <!-- Current week -->
          <section class="card divide-y divide-hairline overflow-hidden">
            <div
              v-for="row in currentWeek" :key="row.iso"
              class="flex items-center gap-3 px-4 py-3"
              :class="row.isToday ? 'bg-ember-50/50' : ''"
            >
              <span class="w-28 shrink-0 font-mono text-[12px] uppercase tracking-wide" :class="row.isToday ? 'font-bold text-ember-600' : 'text-steel-500'">{{ row.label }}</span>
              <template v-if="dayKind(row.shift) === 'work'">
                <span class="size-2 rounded-full bg-success" />
                <span class="font-mono text-[13px] font-semibold tabular-nums text-ink">{{ hm(row.shift!.start_time) }}–{{ hm(row.shift!.end_time) }}</span>
                <span v-if="row.shift!.note" class="ml-1 truncate text-[12px] text-steel-500">{{ row.shift!.note }}</span>
              </template>
              <template v-else-if="dayKind(row.shift) === 'cover'">
                <span class="size-2 rounded-full bg-info" />
                <span class="font-mono text-[13px] font-semibold tabular-nums text-info-600">{{ hm(row.shift!.start_time) }}–{{ hm(row.shift!.end_time) }}</span>
                <span class="ml-1 font-mono text-[11px] uppercase tracking-wide text-info-600">cubres un turno</span>
              </template>
              <template v-else-if="dayKind(row.shift) === 'off'">
                <i class="pi pi-moon text-[12px] text-ember-600" />
                <span class="text-[13px] text-ember-600">Día libre</span>
              </template>
              <template v-else>
                <span class="size-2 rounded-full bg-line" />
                <span class="text-[13px] text-steel-400">Descanso</span>
              </template>
            </div>
          </section>

          <!-- Upcoming weeks (accordion) -->
          <section class="flex flex-col gap-2">
            <p class="eyebrow px-1">Próximas semanas</p>
            <div v-for="w in upcoming" :key="w.start" class="card overflow-hidden">
              <button type="button" class="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-app/50" @click="toggleWeek(w.start)">
                <span class="font-mono text-[12px] font-semibold text-ink">{{ isoToDate(w.start).getDate() }} – {{ isoToDate(addDaysIso(w.start, 6)).getDate() }} {{ MONTHS[isoToDate(addDaysIso(w.start, 6)).getMonth()] }}</span>
                <span class="flex items-center gap-3">
                  <span class="font-mono text-[11px] text-steel-500">{{ weekHours(w.rows) }}h</span>
                  <i class="pi text-xs text-steel-400" :class="openWeek === w.start ? 'pi-chevron-up' : 'pi-chevron-down'" />
                </span>
              </button>
              <div v-if="openWeek === w.start" class="divide-y divide-hairline border-t border-hairline">
                <div v-for="row in w.rows" :key="row.iso" class="flex items-center gap-3 px-4 py-2">
                  <span class="w-28 shrink-0 font-mono text-[11px] uppercase tracking-wide text-steel-500">{{ row.label }}</span>
                  <span v-if="dayKind(row.shift) === 'work'" class="font-mono text-[12px] tabular-nums text-ink">{{ hm(row.shift!.start_time) }}–{{ hm(row.shift!.end_time) }}</span>
                  <span v-else-if="dayKind(row.shift) === 'cover'" class="font-mono text-[12px] tabular-nums text-info-600">{{ hm(row.shift!.start_time) }}–{{ hm(row.shift!.end_time) }} · cubres</span>
                  <span v-else-if="dayKind(row.shift) === 'off'" class="text-[12px] text-ember-600">Día libre</span>
                  <span v-else class="text-[12px] text-steel-400">Descanso</span>
                </div>
              </div>
            </div>
          </section>
        </template>
      </div>
    </main>

    <!-- Solicitar día libre -->
    <Dialog v-model:visible="reqOpen" modal :closable="true" :draggable="false" :style="{ width: '24rem' }">
      <template #header><div><p class="eyebrow">Solicitud</p><p class="font-display text-lg font-bold text-ink">Día libre</p></div></template>
      <div v-if="reqDone" class="flex flex-col items-center gap-3 py-6 text-center">
        <span class="grid size-12 place-items-center rounded-full bg-success/15 text-success"><i class="pi pi-check text-xl" /></span>
        <p class="text-sm text-ink">Solicitud enviada. Un administrador la revisará.</p>
      </div>
      <div v-else class="flex flex-col gap-4">
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Fecha</span><input v-model="reqDate" type="date" :min="todayIso" class="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-ember focus:outline-none" /></label>
        <label class="flex flex-col gap-1.5"><span class="eyebrow">Motivo</span><Select v-model="reqReason" :options="MOTIVOS" option-label="label" option-value="value" /></label>
        <p class="rounded-lg bg-info/10 px-3 py-2 text-[12px] text-info-600"><i class="pi pi-info-circle text-[10px]" /> Tu solicitud queda pendiente hasta que un administrador la apruebe.</p>
      </div>
      <template #footer v-if="!reqDone">
        <Button label="Cancelar" text severity="secondary" @click="reqOpen = false" />
        <Button label="Enviar solicitud" icon="pi pi-send" :loading="reqBusy" @click="sendReq" />
      </template>
    </Dialog>
  </AppShell>
</template>
