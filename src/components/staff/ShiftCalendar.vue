<script setup lang="ts">
// Monthly rota grid, hand-built with Tailwind (grid-cols-7) — no calendar or popover library.
//
// The signature is the *service rail*: the hairline along the bottom of every day cell is a
// 24 h track, and each shift paints its own hours onto it. Opening shifts hug the left, closing
// shifts sit right, so a month of scheduling reads as rhythm before it reads as numbers — the
// thing a manager actually scans for. The times stay in mono chips above it for the exact read.
import { computed, ref, watch } from 'vue'
import {
  WEEKDAY_LABELS,
  compactRange,
  formatHours,
  fromISODate,
  hhmm,
  durationHours,
  monthLabel,
  monthMatrix,
  railSegment,
  shiftMonth,
  toISODate,
  totalHours,
} from '@/lib/calendar'
import type { PlannedShift } from '@/services/staff.api'

const props = defineProps<{
  shifts: PlannedShift[]
  canManage: boolean
  loading?: boolean
  /** Read-only mode: the employee is inactive, so no shift can be added or removed. */
  frozen?: boolean
}>()

const emit = defineEmits<{ add: [iso: string]; remove: [shiftId: string] }>()

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth())

const days = computed(() => monthMatrix(year.value, month.value, today))

/** Shifts bucketed by calendar day, sorted by start time so chips read chronologically. */
const shiftsByDate = computed(() => {
  const map: Record<string, PlannedShift[]> = {}
  for (const s of props.shifts) (map[s.shift_date] ??= []).push(s)
  for (const list of Object.values(map)) list.sort((a, b) => a.start_time.localeCompare(b.start_time))
  return map
})

const shiftsOn = (iso: string): PlannedShift[] => shiftsByDate.value[iso] ?? []

/** Only the visible month counts toward the header figures. */
const monthShifts = computed(() =>
  props.shifts.filter((s) => {
    const d = fromISODate(s.shift_date)
    return d.getFullYear() === year.value && d.getMonth() === month.value && s.status !== 'day_off'
  }),
)

const monthTotal = computed(() => ({
  count: monthShifts.value.length,
  hours: formatHours(totalHours(monthShifts.value)),
}))

function step(delta: number) {
  ;[year.value, month.value] = shiftMonth(year.value, month.value, delta)
  openIndex.value = null
}

function goToday() {
  year.value = today.getFullYear()
  month.value = today.getMonth()
  openIndex.value = null
}

const isCurrentMonth = computed(
  () => year.value === today.getFullYear() && month.value === today.getMonth(),
)

// --- Day popover (hand-positioned, no popover library) ----------------------
// The panel is rendered once in a layer above the grid and anchored by the cell's column/row,
// so it can never be clipped by a cell and always opens back toward the calendar's centre.
const openIndex = ref<number | null>(null)

const openDay = computed(() =>
  openIndex.value === null ? null : (days.value[openIndex.value] ?? null),
)
const openShifts = computed(() => (openDay.value ? shiftsOn(openDay.value.iso) : []))

const popoverStyle = computed(() => {
  if (openIndex.value === null) return {}
  const col = openIndex.value % 7
  const row = Math.floor(openIndex.value / 7)
  const horizontal =
    col <= 3
      ? { left: `${(col / 7) * 100}%` }
      : { right: `${((6 - col) / 7) * 100}%` }
  const vertical =
    row <= 2
      ? { top: `calc(${((row + 1) / 6) * 100}% + 0.4rem)` }
      : { bottom: `calc(${((6 - row) / 6) * 100}% + 0.4rem)` }
  return { ...horizontal, ...vertical }
})

function onDayClick(index: number) {
  const day = days.value[index]
  if (!day) return
  if (shiftsOn(day.iso).length) {
    openIndex.value = openIndex.value === index ? null : index
    return
  }
  // An empty day is the fastest place to schedule one: skip the popover, open the form.
  if (props.canManage && !props.frozen) emit('add', day.iso)
}

function remove(shiftId: string) {
  emit('remove', shiftId)
  // Close once the day runs out of shifts; otherwise keep the popover on the remaining ones.
  if (openShifts.value.length <= 1) openIndex.value = null
}

// A month change or an external shift reload can invalidate the anchored cell.
watch(() => props.shifts, () => { if (!openShifts.value.length) openIndex.value = null })

const longDate = (iso: string) =>
  fromISODate(iso).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

/** Spoken label for a cell: the date, then what is actually on it. */
function dayLabel(iso: string): string {
  const list = shiftsOn(iso)
  if (!list.length) return `${longDate(iso)}, sin turnos`
  const detail = list.map((s) => `${hhmm(s.start_time)} a ${hhmm(s.end_time)}`).join(', ')
  return `${longDate(iso)}, ${list.length === 1 ? 'un turno' : `${list.length} turnos`}: ${detail}`
}

const STATUS_LABEL: Record<PlannedShift['status'], string> = {
  scheduled: 'Planificado',
  manual: 'Manual',
  covered: 'Cubierto',
  day_off: 'Día libre',
}

/** Chips carry the shift's state: solid = on the line, outlined = covered, struck = day off. */
function chipClass(status: PlannedShift['status']): string {
  if (status === 'day_off') return 'bg-sunken text-steel-500 line-through'
  if (status === 'covered') return 'bg-transparent text-ember-600 ring-1 ring-inset ring-ember/45'
  return 'bg-ember-50 text-ember-600'
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper">
    <!-- Toolbar: month nav on the left, the month's figures and the add action on the right -->
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="grid size-8 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink"
          aria-label="Mes anterior"
          @click="step(-1)"
        >
          <i class="pi pi-angle-left text-sm" />
        </button>
        <h4
          class="min-w-[9.5rem] text-center font-display text-base font-extrabold capitalize text-ink"
          aria-live="polite"
        >
          {{ monthLabel(year, month) }}
        </h4>
        <button
          type="button"
          class="grid size-8 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink"
          aria-label="Mes siguiente"
          @click="step(1)"
        >
          <i class="pi pi-angle-right text-sm" />
        </button>
        <button
          v-if="!isCurrentMonth"
          type="button"
          class="ml-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500 transition hover:bg-sunken hover:text-ember-600"
          @click="goToday"
        >
          Hoy
        </button>
      </div>

      <div class="flex items-center gap-3">
        <p class="font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500">
          <span class="text-ink">{{ monthTotal.count }}</span> turnos ·
          <span class="text-ink">{{ monthTotal.hours }}</span> h
        </p>
        <button
          v-if="canManage && !frozen"
          type="button"
          class="flex items-center gap-1.5 rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ember-600"
          @click="emit('add', toISODate(new Date()))"
        >
          <i class="pi pi-plus text-[10px]" />
          Agregar turno
        </button>
      </div>
    </header>

    <div class="relative p-3">
      <!-- Weekday rail -->
      <div class="grid grid-cols-7 gap-px pb-1.5">
        <div
          v-for="label in WEEKDAY_LABELS"
          :key="label"
          class="py-1 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-steel-400"
        >
          {{ label }}
        </div>
      </div>

      <!-- The month. gap-px over a line-coloured bed draws hairline rules without borders. -->
      <div class="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-line">
        <button
          v-for="(day, i) in days"
          :key="day.iso"
          type="button"
          class="group relative flex h-[4.9rem] flex-col items-stretch gap-1 p-1.5 text-left transition focus-visible:z-10"
          :class="[
            day.inMonth ? 'bg-paper' : 'bg-app',
            day.isToday ? 'ring-2 ring-inset ring-ember' : '',
            openIndex === i ? 'z-10 ring-2 ring-inset ring-ember/50' : '',
            day.inMonth && (shiftsOn(day.iso).length || (canManage && !frozen))
              ? 'cursor-pointer hover:bg-ember-50/45'
              : 'cursor-default',
          ]"
          :data-day="day.iso"
          :aria-label="dayLabel(day.iso)"
          :aria-expanded="shiftsOn(day.iso).length ? openIndex === i : undefined"
          @click="onDayClick(i)"
        >
          <span
            class="font-mono text-[11px] leading-none"
            :class="[
              day.inMonth ? (day.isWeekend ? 'text-steel-500' : 'text-ink') : 'text-steel-300',
              day.isToday ? 'font-bold text-ember-600' : '',
            ]"
          >
            {{ day.dayNumber }}
          </span>

          <!-- Up to two chips; the rest collapse into a count. -->
          <span class="flex min-h-0 flex-1 flex-col gap-0.5">
            <span
              v-for="s in shiftsOn(day.iso).slice(0, 2)"
              :key="s.id"
              class="truncate rounded px-1 py-0.5 text-center font-mono text-[10px] leading-tight"
              :class="chipClass(s.status)"
            >
              {{ compactRange(s.start_time, s.end_time) }}
            </span>
            <span
              v-if="shiftsOn(day.iso).length > 2"
              class="px-1 font-mono text-[9px] uppercase tracking-wide text-steel-500"
            >
              +{{ shiftsOn(day.iso).length - 2 }} más
            </span>
          </span>

          <!-- The service rail: this day's hours, positioned across a 24 h track. -->
          <span
            v-if="shiftsOn(day.iso).length"
            class="relative block h-[3px] w-full rounded-full bg-hairline"
            aria-hidden="true"
          >
            <span
              v-for="s in shiftsOn(day.iso)"
              :key="s.id"
              class="absolute inset-y-0 rounded-full"
              :class="s.status === 'day_off' ? 'bg-steel-300' : 'bg-ember'"
              :style="{
                left: `${railSegment(s.start_time, s.end_time).left}%`,
                width: `${railSegment(s.start_time, s.end_time).width}%`,
              }"
            />
          </span>
        </button>
      </div>

      <!-- The rail's key, stated once instead of on every cell. Deliberately a caption and not
           a full-width axis: the 24 h track belongs to each cell, not to the row. -->
      <p class="mt-2 text-center font-mono text-[10px] text-steel-400">
        La barra de cada día marca las horas del turno sobre 24 h.
      </p>

      <p v-if="loading" class="pt-2 text-center font-mono text-[11px] text-steel-500">
        Cargando turnos…
      </p>

      <!-- Day popover -->
      <template v-if="openDay">
        <!-- Click-away layer; sits under the panel, over everything else. -->
        <div class="fixed inset-0 z-20" @click="openIndex = null" />
        <div
          class="absolute z-30 w-60 rounded-xl border border-line bg-paper p-3 shadow-xl shadow-graphite-900/10"
          :style="popoverStyle"
          role="dialog"
          :aria-label="longDate(openDay.iso)"
          @keydown.esc="openIndex = null"
        >
          <p class="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] capitalize text-steel-500">
            {{ longDate(openDay.iso) }}
          </p>

          <ul class="flex flex-col gap-1.5">
            <li
              v-for="s in openShifts"
              :key="s.id"
              class="flex items-start justify-between gap-2 rounded-lg bg-app px-2.5 py-2"
            >
              <span class="min-w-0">
                <span class="block font-mono text-sm text-ink">
                  {{ hhmm(s.start_time) }}–{{ hhmm(s.end_time) }}
                </span>
                <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ formatHours(durationHours(s.start_time, s.end_time)) }} h ·
                  {{ STATUS_LABEL[s.status] }}
                </span>
                <span v-if="s.note" class="mt-0.5 block text-[11px] text-muted">{{ s.note }}</span>
              </span>
              <button
                v-if="canManage && !frozen"
                type="button"
                class="shrink-0 rounded-md p-1 text-steel-400 transition hover:bg-alert/10 hover:text-alert"
                aria-label="Eliminar turno"
                @click="remove(s.id)"
              >
                <i class="pi pi-trash text-xs" />
              </button>
            </li>
          </ul>

          <button
            v-if="canManage && !frozen"
            type="button"
            class="mt-2 w-full rounded-lg border border-dashed border-line py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
            @click="emit('add', openDay.iso); openIndex = null"
          >
            + Otro turno este día
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
