<script setup lang="ts">
// One stop as a node on the run's transit line (the "riel de paradas"). The left gutter draws the
// line + the node; the right side is a compact, tappable card. The node encodes state: current =
// ember "you are here" (breathing), delivered = filled success + check, not_delivered = filled
// alert + x, pending/assigned = hollow steel ring holding its delivery-order number.
import { computed } from 'vue'
import { formatCOP } from '@/lib/money'
import type { DriverStop } from '@/services/delivery.api'

const props = defineProps<{
  stop: DriverStop
  /** Delivery-order number shown in the node (route_position, or list order as fallback). */
  position: number
  isNext: boolean
  /** First node hides the top connector, last hides the bottom one. */
  first: boolean
  last: boolean
  /** The connector above this node is "traveled" (previous stop is done). */
  travelledIn: boolean
}>()
const emit = defineEmits<{ open: [id: string] }>()

const isDelivered = computed(() => props.stop.delivery_status === 'delivered')
const isFailed = computed(() => props.stop.delivery_status === 'not_delivered')
const isCurrent = computed(() => props.isNext)
// Cash to collect: unpaid stop with a total, not yet settled.
const collectCash = computed(
  () =>
    props.stop.paid !== true &&
    props.stop.total !== null &&
    !isDelivered.value &&
    !isFailed.value,
)
const prepaid = computed(() => props.stop.paid === true)

// Connector colours: a segment is "spent" once the stop above it is settled.
const inColor = computed(() => (props.travelledIn ? 'bg-steel-300' : 'bg-line'))
const outColor = computed(() =>
  isDelivered.value || isFailed.value ? 'bg-steel-300' : 'bg-line',
)
</script>

<template>
  <div class="flex gap-3">
    <!-- Left gutter: the line and the node -->
    <div class="relative flex w-6 flex-none flex-col items-center">
      <span class="h-2.5 w-0.5 rounded-full" :class="first ? 'bg-transparent' : inColor" />
      <span
        class="grid size-6 flex-none place-items-center rounded-full border text-[11px] font-bold transition"
        :class="[
          isCurrent
            ? 'border-ember bg-ember text-white'
            : isDelivered
              ? 'border-success bg-success text-white'
              : isFailed
                ? 'border-alert bg-alert text-white'
                : 'border-steel-300 bg-paper text-steel-500',
          isCurrent ? 'shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ember)_22%,transparent)]' : '',
        ]"
      >
        <i v-if="isDelivered" class="pi pi-check text-[10px]" />
        <i v-else-if="isFailed" class="pi pi-times text-[10px]" />
        <span v-else class="font-mono">{{ position }}</span>
      </span>
      <span class="w-0.5 flex-1 rounded-full" :class="last ? 'bg-transparent' : outColor" />
    </div>

    <!-- Right: the compact stop card -->
    <!-- `min-w-0` NO es opcional y no es redundante con el `min-w-0` de dentro.
         Este botón es el flex item; sin esto su `min-width:auto` vale el ancho ENTERO de la
         dirección, porque `truncate` lleva `white-space:nowrap` y eso es lo que mide el
         min-content. El `min-w-0` de dentro deja encoger al div, pero no cambia lo que este
         botón le declara a su padre: una dirección larga de verdad medía 580px dentro de 252
         disponibles y sacaba scroll horizontal a toda la pantalla. -->
    <button
      type="button"
      class="mb-2 min-w-0 flex-1 rounded-xl border bg-paper px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :class="
        isCurrent
          ? 'border-ember/50 shadow-[0_10px_28px_-20px_color-mix(in_oklab,var(--color-ember)_75%,transparent)]'
          : 'border-line hover:bg-sunken'
      "
      :aria-label="`Pedido ${stop.order_code ?? ''}, ${stop.address_text}`"
      @click="emit('open', stop.id)"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate font-display text-[15px] font-bold leading-tight text-ink">
            {{ stop.address_text }}
          </p>
          <p class="mt-0.5 truncate text-xs text-muted">
            {{ stop.customer_name ?? 'Cliente' }}
          </p>
        </div>
        <span v-if="stop.order_code" class="flex-none font-mono text-[11px] text-steel-400">
          {{ stop.order_code }}
        </span>
      </div>

      <div class="mt-2 flex items-center justify-between gap-2">
        <span
          v-if="collectCash"
          class="inline-flex items-center gap-1.5 rounded-md bg-ember-50 px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums text-ember-600"
        >
          <i class="pi pi-money-bill text-[11px]" />{{ formatCOP(stop.total) }}
        </span>
        <span
          v-else
          class="font-mono text-[12px] tabular-nums"
          :class="prepaid ? 'text-steel-400' : 'text-steel-500'"
        >
          {{ prepaid ? 'Pagado' : formatCOP(stop.total) }}
        </span>
        <span v-if="stop.not_delivered_reason" class="truncate text-[11px] text-alert-600">
          {{ stop.not_delivered_reason }}
        </span>
        <i v-else class="pi pi-angle-right text-xs text-steel-400" />
      </div>
    </button>
  </div>
</template>
