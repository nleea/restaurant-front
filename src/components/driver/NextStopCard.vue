<script setup lang="ts">
// The hero: the one stop the driver is riding toward. It leads with the address (read at a
// glance) and, when there's cash to collect, the amount as the biggest figure on the screen —
// that is what the rider is accountable for. Ember heat marks it as the active thing under the
// lamp. The primary action follows the run phase: while `preparing` the whole run departs at
// once ("Salir a repartir"); once `in_transit` the button opens this stop's detail to settle it.
import { computed } from 'vue'
import { formatCOP } from '@/lib/money'
import StatusPill from './StatusPill.vue'
import type { DriverStop } from '@/services/delivery.api'

const props = defineProps<{ stop: DriverStop; phase: 'preparing' | 'in_transit' }>()
const emit = defineEmits<{ open: [id: string]; depart: [] }>()

const departing = computed(() => props.phase === 'preparing')
// Cash to collect: not yet paid (false or unrecorded) and there is a total to charge.
const collect = computed(() => props.stop.paid !== true && props.stop.total !== null)
</script>

<template>
  <article class="card heat-warm overflow-hidden">
    <!-- Perforated top edge: this is a docket, like every working surface in El Pase. -->
    <div class="docket-perf h-1.5" aria-hidden="true" />

    <div class="px-4 pb-4 pt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="eyebrow text-ember-600">Siguiente pedido</p>
        <StatusPill :status="stop.delivery_status" />
      </div>

      <button
        type="button"
        class="mt-2 block w-full text-left"
        :aria-label="`Ver detalle del pedido ${stop.order_code ?? ''}`"
        @click="emit('open', stop.id)"
      >
        <!-- `break-words`: el cliente escribe la dirección a mano y a veces sin espacios. Sin
             esto la tarjeta la RECORTA (por su `overflow-hidden`) en vez de partirla, y una
             dirección recortada a la mitad no lleva a nadie a ninguna puerta. -->
        <h2 class="break-words font-display text-hero font-extrabold leading-tight text-ink">
          {{ stop.address_text }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          <template v-if="stop.customer_name">{{ stop.customer_name }} · </template>
          <span class="font-mono text-steel-500">{{ stop.neighborhood ?? 'Sin barrio' }}</span>
        </p>
      </button>

      <!-- Money line: the accountable figure. Cash to collect glows; prepaid is quiet. -->
      <div
        v-if="stop.total !== null"
        class="mt-3 flex items-end justify-between gap-3 rounded-xl border px-3.5 py-3"
        :class="collect ? 'border-ember/40 bg-ember-50' : 'border-line bg-sunken'"
      >
        <div class="min-w-0">
          <p class="eyebrow" :class="collect ? 'text-ember-600' : 'text-steel-500'">
            {{ collect ? 'Cobrar en efectivo' : 'Ya pagado' }}
          </p>
          <p
            class="mt-0.5 font-mono font-extrabold tabular-nums leading-none"
            :class="collect ? 'text-2xl text-ember-600' : 'text-lg text-steel-500'"
          >
            {{ formatCOP(stop.total) }}
          </p>
        </div>
        <span v-if="stop.order_code" class="flex-none pb-0.5 font-mono text-[11px] text-steel-400">
          {{ stop.order_code }}
        </span>
      </div>

      <!-- Primary action, thumb-reachable: preparing → depart the run; in transit → settle here. -->
      <button
        type="button"
        class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
        @click="departing ? emit('depart') : emit('open', stop.id)"
      >
        <i :class="departing ? 'pi pi-send' : 'pi pi-flag-fill'" class="text-sm" />
        {{ departing ? 'Salir a repartir' : 'Ver detalle y entregar' }}
      </button>
    </div>
  </article>
</template>
