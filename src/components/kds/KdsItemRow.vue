<script setup lang="ts">
import { computed } from 'vue'
import { itemAlert, itemDoneCount, itemStatus, minutesSince } from '@/lib/kds/logic'
import type { KdsComponent, KdsItem } from '@/lib/kds/types'
import { useKdsBoard } from './useKdsBoard'

// The docket is always a light "paper" chit (in both themes, like a real printed dupe), so every
// colour in here is fixed to the paper surface — no light/dark theme branching. Only heat/state
// (ember / alert / success) ever carries colour.
const props = defineProps<{ orderId: string; item: KdsItem; now: number }>()

const board = useKdsBoard()

const isOpen = computed(() => board.expanded.has(props.item.id))
const status = computed(() => itemStatus(props.item))
const doneCount = computed(() => itemDoneCount(props.item))
const total = computed(() => props.item.components.length)
const alert = computed(() => itemAlert(props.item, props.now))

function isCold(c: KdsComponent): boolean {
  return !!alert.value && c.status === 'done' && c.name === alert.value.coldName && c.station === alert.value.coldStation
}
function isBlocker(c: KdsComponent): boolean {
  return !!alert.value && c.status !== 'done' && c.station === alert.value.waitingStation
}

// Relay segment fill: heat/state only. Cooling-done glows alert (the seam leaking heat).
function segClass(c: KdsComponent): string {
  if (c.status === 'done') return isCold(c) ? 'bg-alert' : 'bg-success'
  if (c.status === 'cooking') return 'bg-ember'
  return 'bg-steel-300'
}

const statusPill = computed(() => {
  if (status.value === 'done') return { text: 'Listo', cls: 'pill-success' }
  if (status.value === 'cooking') return { text: `En fuego ${doneCount.value}/${total.value}`, cls: 'pill-warn' }
  return { text: 'En cola', cls: 'pill-neutral' }
})

function compTimer(c: KdsComponent): string | null {
  if (c.status === 'done' && c.doneAt !== null) {
    const m = minutesSince(c.doneAt, props.now)
    return m < 1 ? null : `${m}m`
  }
  return null
}
</script>

<template>
  <div class="border-b border-line py-2.5 last:border-0">
    <!-- Item header: qty · name · status -->
    <div class="flex items-start gap-2.5">
      <span
        class="mt-0.5 grid min-w-7 shrink-0 place-items-center rounded-md bg-sunken px-1.5 py-0.5 font-mono text-[13px] font-bold tabular-nums text-ink"
      >
        {{ item.qty }}×
      </span>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h4
            class="truncate font-display text-[15px] font-bold leading-tight text-ink"
            :class="status === 'done' ? 'line-through opacity-55' : ''"
          >
            {{ item.name }}
          </h4>
          <span class="pill shrink-0" :class="statusPill.cls">{{ statusPill.text }}</span>
        </div>

        <p v-if="item.modifiers.length" class="mt-0.5 truncate text-[12px] text-muted">
          {{ item.modifiers.join(' · ') }}
        </p>

        <!-- Controls: recipe (hidden until a backend source exists) + expand -->
        <div class="mt-1 flex items-center gap-2">
          <button
            v-if="board.recipesEnabled"
            type="button"
            class="rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-steel-600 transition hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            @click="board.openRecipe(orderId, item.id)"
          >
            Receta
          </button>
          <button
            type="button"
            class="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-steel-600 transition hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :aria-expanded="isOpen"
            @click="board.toggleExpanded(item.id)"
          >
            <span class="transition-transform" :class="isOpen ? 'rotate-180' : ''">▾</span>
            {{ total }} componentes
          </button>
        </div>
      </div>
    </div>

    <!-- Components (collapsed by default) -->
    <Transition name="kds-slide">
      <ul v-if="isOpen" class="mt-2 space-y-0.5 pl-9">
        <li
          v-for="c in item.components"
          :key="c.id"
          class="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition"
          :class="[
            isBlocker(c) ? 'border-l-2 border-ember' : 'border-l-2 border-transparent',
            board.activeStation.value && c.station !== board.activeStation.value ? 'opacity-40' : '',
            board.canUpdate.value && c.status !== 'done' ? 'cursor-pointer hover:bg-sunken' : '',
          ]"
          @click="board.cycleComponent(orderId, item.id, c.id)"
        >
          <!-- station tag: mono, no hue (the risk) -->
          <span
            class="grid w-7 shrink-0 place-items-center rounded bg-sunken font-mono text-[10px] font-bold tracking-wide text-steel-600"
            :title="board.stationMeta(c.station).label"
          >
            {{ board.stationMeta(c.station).tag }}
          </span>

          <div class="min-w-0 flex-1">
            <span
              class="block truncate text-[13px] text-ink"
              :class="c.status === 'done' ? 'opacity-55 line-through' : ''"
            >
              {{ c.name }}
            </span>
            <!-- Itemized station tasks: read-only detail; collapsed once the component is done -->
            <ul v-if="c.tasks.length && c.status !== 'done'" class="mt-0.5 space-y-px">
              <li
                v-for="(task, ti) in c.tasks"
                :key="ti"
                class="truncate font-mono text-[11px] leading-tight text-steel-600"
              >
                · {{ task }}
              </li>
            </ul>
          </div>

          <span
            v-if="compTimer(c)"
            class="shrink-0 font-mono text-[10px] tabular-nums"
            :class="isCold(c) ? 'text-alert' : 'text-steel-500'"
          >
            {{ compTimer(c) }}
          </span>

          <!-- status glyph: heat/state only -->
          <span class="grid w-4 shrink-0 place-items-center text-[13px]">
            <span v-if="c.status === 'done'" class="text-success">✓</span>
            <span v-else-if="c.status === 'cooking'" class="h-2 w-2 animate-pulse rounded-full bg-ember" />
            <span v-else class="h-2 w-2 rounded-full ring-1 ring-steel-400" />
          </span>
        </li>
      </ul>
    </Transition>

    <!-- The "waiting on…" strip: the relay is breaking -->
    <Transition name="kds-slide">
      <div
        v-if="alert"
        class="ml-9 mt-2 rounded-r-md border-l-4 px-3 py-1.5 text-[12px] font-medium"
        :class="{
          'border-warn bg-warn/15 text-warn-600': alert.severity === 'warn',
          'border-alert bg-alert/15 text-alert-600': alert.severity === 'urgent',
          'border-alert bg-alert/20 text-alert-600 animate-pulse': alert.severity === 'critical',
        }"
      >
        <template v-if="alert.severity === 'warn'">
          ⚠ Esperando {{ board.stationMeta(alert.waitingStation).label }} · {{ alert.coldName }} se enfría
        </template>
        <template v-else-if="alert.severity === 'urgent'">
          🔴 URGENTE · {{ alert.coldName }} lleva {{ alert.minutes }} min — agilizar {{ board.stationMeta(alert.waitingStation).label }}
        </template>
        <template v-else>
          🚨 CRÍTICO · puede requerir rehacer — {{ board.stationMeta(alert.waitingStation).label }} retrasa {{ alert.minutes }} min
        </template>
      </div>
    </Transition>

    <!-- Signature: the relay track — components as one bar, in fire→plate order -->
    <div class="ml-9 mt-2 flex items-center gap-2">
      <div class="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full">
        <span
          v-for="c in item.components"
          :key="c.id"
          class="h-full flex-1 rounded-full transition-all duration-500"
          :class="[segClass(c), isCold(c) ? 'shadow-[0_0_8px] shadow-alert/60' : '']"
        />
      </div>
      <span class="shrink-0 font-mono text-[10px] tabular-nums text-steel-500">{{ doneCount }}/{{ total }}</span>
    </div>
  </div>
</template>

<style scoped>
.kds-slide-enter-active,
.kds-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.kds-slide-enter-from,
.kds-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .kds-slide-enter-active,
  .kds-slide-leave-active {
    transition: none;
  }
}
</style>
