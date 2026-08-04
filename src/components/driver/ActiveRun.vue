<script setup lang="ts">
// The home when a despacho is open. Three phases, driven by the run status:
//  · preparing  — the hero departs the whole run ("Salir a repartir"); stops read "Asignado".
//  · in transit — the hero opens the next stop so the driver can settle it.
//  · complete   — every stop settled → the completion panel finishes the run.
// Below it, the whole run drawn as the stop-rail signature.
import { computed } from 'vue'
import { formatCOP } from '@/lib/money'
import { useDriverStore } from '@/stores/driver'
import NextStopCard from './NextStopCard.vue'
import StopRail from './StopRail.vue'

const driver = useDriverStore()
const emit = defineEmits<{ open: [id: string] }>()

const progressPct = computed(() =>
  driver.totalCount ? Math.round((driver.settledCount / driver.totalCount) * 100) : 0,
)
// Only in_transit runs can be "complete" and finished — a preparing run's stops are all assigned.
const showCompletion = computed(() => driver.isComplete && driver.run?.status === 'in_transit')
const phase = computed<'preparing' | 'in_transit'>(() =>
  driver.run?.status === 'preparing' ? 'preparing' : 'in_transit',
)
</script>

<template>
  <div>
    <!-- Progress strip: sense of advance without leaving home -->
    <div class="flex items-center justify-between gap-3">
      <p class="eyebrow">Tu ruta</p>
      <p class="font-mono text-[12px] font-semibold tabular-nums text-steel-600">
        {{ driver.deliveredCount }} de {{ driver.totalCount }} entregados
      </p>
    </div>
    <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
      <div
        class="h-full rounded-full bg-ember transition-[width] duration-500"
        :style="{ width: `${progressPct}%` }"
      />
    </div>

    <!-- Hero: completion panel, next stop, or (an empty preparing run) a bare depart CTA -->
    <div class="mt-4">
      <article v-if="showCompletion" class="card pulse-ready overflow-hidden">
        <div class="px-4 py-5 text-center">
          <span class="grid size-12 place-items-center rounded-full bg-success/12 text-success-600">
            <i class="pi pi-check-circle text-2xl" />
          </span>
          <h2 class="mt-3 font-display text-xl font-extrabold text-ink">Despacho completado</h2>
          <p class="mt-1 text-sm text-muted">
            Entregaste {{ driver.deliveredCount }} de {{ driver.totalCount }}.
            <template v-if="driver.cashCollected">
              Llevas
              <span class="font-mono font-bold text-ember-600">{{
                formatCOP(driver.cashCollected)
              }}</span>
              en efectivo.
            </template>
          </p>
          <button
            type="button"
            class="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
            @click="driver.finishMyRun()"
          >
            <i class="pi pi-flag-fill text-sm" /> Finalizar despacho
          </button>
        </div>
      </article>

      <NextStopCard
        v-else-if="driver.nextStop"
        :stop="driver.nextStop"
        :phase="phase"
        @open="emit('open', $event)"
        @depart="driver.departMyRun()"
      />

      <!-- A preparing run with no stops pulled: still lets the driver depart (then finish). -->
      <article v-else-if="phase === 'preparing'" class="card overflow-hidden">
        <div class="px-4 py-5 text-center">
          <span class="grid size-12 place-items-center rounded-full bg-sunken text-steel-400">
            <i class="pi pi-inbox text-2xl" />
          </span>
          <h2 class="mt-3 font-display text-lg font-bold text-ink">Sin pedidos por ahora</h2>
          <p class="mt-1 text-sm text-muted">
            No hay pedidos pendientes para tu despacho. Puedes salir cuando quieras.
          </p>
          <button
            type="button"
            class="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
            @click="driver.departMyRun()"
          >
            <i class="pi pi-send text-sm" /> Salir a repartir
          </button>
        </div>
      </article>
    </div>

    <!-- The run as a transit line: the signature -->
    <template v-if="driver.totalCount">
      <p class="mb-2 mt-6 eyebrow">Paradas</p>
      <StopRail
        :stops="driver.stops"
        :next-stop-id="driver.nextStop?.id ?? null"
        @open="emit('open', $event)"
      />
    </template>
  </div>
</template>
