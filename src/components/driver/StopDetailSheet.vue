<script setup lang="ts">
// Full stop detail as a bottom sheet: who, where, what, how much, and the doorstep decision. The
// action zone follows the stop's state: while the run is preparing (stop `assigned`) the driver
// can push a wrongly-pulled stop back to the pool; once in transit they mark it delivered, or not
// (→ reason picker); once settled it's read-only. Call and navigate are one tap (tel: / maps),
// shown only when the data exists. The verdict buttons live pinned in the thumb zone.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatCOP } from '@/lib/money'
import StatusPill from './StatusPill.vue'
import FailReasonSheet from './FailReasonSheet.vue'
import type { DriverStop } from '@/services/delivery.api'

const props = defineProps<{ stop: DriverStop }>()
const emit = defineEmits<{
  close: []
  delivered: [id: string]
  failed: [id: string, reason: string, comment: string]
  unassign: [id: string]
}>()

const showReasons = ref(false)
// The doorstep verdict is only offered once the run has departed (stop is in transit).
const canSettle = computed(() => props.stop.delivery_status === 'in_transit')
// While the run is still preparing, a wrongly-pulled stop can be returned to the pool.
const canUnassign = computed(
  () => props.stop.delivery_status === 'assigned' || props.stop.delivery_status === 'pending',
)
// Cash to collect: unpaid stop (false or unrecorded) with a total to charge.
const collect = computed(() => props.stop.paid !== true && props.stop.total !== null)

const coords = computed(() => {
  if (props.stop.latitude === null || props.stop.longitude === null) return null
  const lat = Number.parseFloat(props.stop.latitude)
  const lng = Number.parseFloat(props.stop.longitude)
  return Number.isNaN(lat) || Number.isNaN(lng) ? null : { lat, lng }
})
const mapsHref = computed(() =>
  coords.value
    ? `https://www.google.com/maps/search/?api=1&query=${coords.value.lat},${coords.value.lng}`
    : null,
)
// delivered_at is an ISO timestamp; show just the time of day for the settled stamp.
const settledTime = computed(() => {
  if (!props.stop.delivered_at) return null
  const d = new Date(props.stop.delivered_at)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-[60] bg-graphite-900/40 backdrop-blur-sm" @click="emit('close')" />
  <aside
    class="sheet fixed inset-x-0 bottom-0 z-[65] mx-auto flex max-h-[92dvh] max-w-md flex-col rounded-t-2xl border border-line bg-paper"
    role="dialog"
    aria-modal="true"
    :aria-label="`Pedido ${stop.order_code ?? ''}`"
  >
    <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div class="min-w-0">
        <p class="eyebrow">Pedido {{ stop.order_code ?? '—' }}</p>
        <p class="truncate font-display text-lg font-bold text-ink">{{ stop.address_text }}</p>
      </div>
      <button
        type="button"
        class="grid size-9 flex-none place-items-center rounded-lg border border-line text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        aria-label="Cerrar detalle"
        @click="emit('close')"
      >
        <i class="pi pi-times" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      <div class="flex items-center justify-between gap-2">
        <StatusPill :status="stop.delivery_status" />
        <span v-if="settledTime" class="font-mono text-[11px] text-steel-400">
          {{ settledTime }}
        </span>
      </div>

      <!-- Customer + call -->
      <div class="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-ink">{{ stop.customer_name ?? 'Cliente' }}</p>
          <p v-if="stop.customer_phone" class="font-mono text-[12px] tabular-nums text-steel-500">
            {{ stop.customer_phone }}
          </p>
          <p v-else class="font-mono text-[12px] text-steel-400">Sin teléfono</p>
        </div>
        <a
          v-if="stop.customer_phone"
          :href="`tel:${stop.customer_phone}`"
          class="flex min-h-11 flex-none items-center gap-2 rounded-xl bg-graphite-900 px-4 text-sm font-bold text-white transition hover:bg-graphite-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
        >
          <i class="pi pi-phone text-sm" /> Llamar
        </a>
      </div>

      <!-- Address + navigate -->
      <div class="mt-3 rounded-xl border border-line bg-surface p-3">
        <p class="eyebrow">Dirección</p>
        <p class="mt-1 break-words text-sm text-ink">{{ stop.address_text }}</p>
        <p v-if="stop.neighborhood" class="mt-0.5 font-mono text-[12px] text-steel-500">
          {{ stop.neighborhood }}
        </p>
        <a
          v-if="mapsHref"
          :href="mapsHref"
          target="_blank"
          rel="noopener"
          class="mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-ember-600 hover:underline"
        >
          <i class="pi pi-directions text-[11px]" /> Abrir en mapa
        </a>
        <p v-else class="mt-2 font-mono text-[11px] text-steel-400">
          <i class="pi pi-map-marker text-[11px]" /> Sin ubicación en el mapa
        </p>
      </div>

      <!-- Items -->
      <div v-if="stop.items.length" class="mt-3 rounded-xl border border-line bg-surface p-3">
        <p class="eyebrow">Pedido</p>
        <ul class="mt-1.5 flex flex-col gap-1">
          <li
            v-for="(it, i) in stop.items"
            :key="i"
            class="flex items-baseline gap-2 text-sm text-ink"
          >
            <span class="font-mono text-[12px] tabular-nums text-steel-500">{{ it.quantity }}×</span>
            <span class="min-w-0 flex-1">{{ it.name }}</span>
          </li>
        </ul>
        <p
          v-if="stop.notes"
          class="mt-2 rounded-lg bg-ember-50 px-2.5 py-1.5 text-[13px] text-ember-600"
        >
          <i class="pi pi-info-circle text-[11px]" /> {{ stop.notes }}
        </p>
      </div>

      <!-- Money -->
      <div
        v-if="stop.total !== null"
        class="mt-3 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
        :class="collect ? 'border-ember/40 bg-ember-50' : 'border-line bg-sunken'"
      >
        <div class="min-w-0">
          <p class="eyebrow" :class="collect ? 'text-ember-600' : 'text-steel-500'">
            {{ collect ? 'Cobrar en efectivo' : 'Ya pagado' }}
          </p>
          <p v-if="stop.payment_method" class="mt-0.5 font-mono text-[11px] text-steel-400">
            {{ stop.payment_method }}
          </p>
        </div>
        <p
          class="flex-none font-mono text-xl font-extrabold tabular-nums"
          :class="collect ? 'text-ember-600' : 'text-steel-500'"
        >
          {{ formatCOP(stop.total) }}
        </p>
      </div>

      <p
        v-if="stop.not_delivered_reason"
        class="mt-3 rounded-xl border border-alert/30 bg-alert/5 px-3 py-2 text-[13px] text-alert-600"
      >
        <i class="pi pi-flag text-[11px]" /> {{ stop.not_delivered_reason }}
      </p>
    </div>

    <!-- Action zone: verdict (in transit), unassign (preparing), or back (settled) -->
    <div
      v-if="canSettle"
      class="grid grid-cols-1 gap-2 border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
    >
      <!-- En efectivo, confirmar la plata y cerrar la comanda son el mismo gesto: o pasan
           las dos cosas, o no pasa ninguna. El botón lo dice para que nadie lo pulse
           creyendo que solo marca la entrega. -->
      <button
        type="button"
        class="flex min-h-13 w-full flex-col items-center justify-center gap-0.5 rounded-xl bg-success py-2 text-white transition hover:bg-success-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
        data-deliver
        @click="emit('delivered', stop.id)"
      >
        <span class="flex items-center gap-2 text-base font-bold">
          <i class="pi pi-check-circle text-base" />
          {{ collect ? `Recibí ${formatCOP(stop.total)} y entregué` : 'Marcar como entregado' }}
        </span>
        <span v-if="collect" class="font-mono text-[10px] uppercase tracking-[0.14em] opacity-90">
          confirma el dinero y cierra la comanda
        </span>
      </button>
      <button
        type="button"
        class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-steel-600 transition hover:border-alert/40 hover:text-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
        @click="showReasons = true"
      >
        <i class="pi pi-flag text-sm" /> No se pudo entregar
      </button>
    </div>
    <div
      v-else-if="canUnassign"
      class="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
    >
      <button
        type="button"
        class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-steel-600 transition hover:border-alert/40 hover:text-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
        @click="emit('unassign', stop.id)"
      >
        <i class="pi pi-undo text-sm" /> Quitar de mi despacho
      </button>
    </div>
    <div v-else class="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
      <button
        type="button"
        class="min-h-12 w-full rounded-xl border border-line bg-surface text-sm font-semibold text-steel-600 transition hover:bg-sunken"
        @click="emit('close')"
      >
        Volver a la ruta
      </button>
    </div>

    <FailReasonSheet
      v-if="showReasons"
      @close="showReasons = false"
      @confirm="(reason, comment) => emit('failed', stop.id, reason, comment)"
    />
  </aside>
</template>

<style scoped>
@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.sheet {
  animation: sheet-in 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
</style>
