<script setup lang="ts">
// SIGNATURE — the order as a restaurant chit. A thermal-paper receipt with scalloped edges and mono,
// tabular figures, reused across cart / summary / confirmation. Ties the customer flow to the
// kitchen's own artifact (the comanda). Paper + ink come from the tenant theme via CSS vars, so it
// wears each restaurant's palette; the primary color carries the total and the order number.
import { computed } from 'vue'
import { lineTotal, type CartItem } from '@/lib/storefront'
import { formatCOP } from '@/lib/money'

const props = defineProps<{
  restaurantName: string
  items: CartItem[]
  subtotal: number
  deliveryFee: number
  total: number
  variant: 'cart' | 'summary' | 'final'
  fulfillmentLabel?: string
  paymentLabel?: string
  orderNumber?: string | number | null
  // Un domicilio sin cotizar. El total de abajo NO es el total a pagar, y decirlo es el punto:
  // un "Total" a secas que sube después es la discusión en la puerta que esto evita.
  deliveryPending?: boolean
}>()
const emit = defineEmits<{
  (e: 'edit', uid: string): void
  (e: 'inc', uid: string): void
  (e: 'dec', uid: string): void
  (e: 'remove', uid: string): void
}>()

const editable = computed(() => props.variant === 'cart')
</script>

<template>
  <div class="sf-ticket" :class="variant === 'final' ? 'sf-ticket--final' : ''">
    <div class="sf-perf sf-perf--top" />
    <div class="bg-[var(--sf-paper)] px-5 pb-5 pt-4 text-[var(--sf-text)]">
      <!-- Masthead -->
      <div class="text-center">
        <p class="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--sf-muted)]">Comanda</p>
        <p class="mt-0.5 text-lg font-bold leading-tight">{{ restaurantName }}</p>
        <p v-if="orderNumber" class="mt-1 font-mono text-[13px] font-bold tracking-widest text-[var(--sf-primary)]">
          PEDIDO #{{ orderNumber }}
        </p>
      </div>

      <div class="sf-rule my-3" />

      <!-- Line items -->
      <p v-if="!items.length" class="py-6 text-center font-mono text-[12px] text-[var(--sf-muted)]">
        Tu comanda está vacía.
      </p>
      <ul v-else class="flex flex-col gap-3">
        <li v-for="it in items" :key="it.uid" class="font-mono text-[13px]">
          <div class="flex items-baseline gap-2">
            <span class="tabular-nums text-[var(--sf-muted)]">{{ it.quantity }}×</span>
            <span class="min-w-0 flex-1 font-sans font-semibold leading-tight">{{ it.name }}</span>
            <span class="shrink-0 tabular-nums">{{ formatCOP(lineTotal(it)) }}</span>
          </div>
          <!-- Configured extras / removals / note, as receipt sub-lines -->
          <div class="mt-0.5 space-y-0.5 pl-6 text-[11px] text-[var(--sf-muted)]">
            <p v-for="a in it.addons" :key="a.id">+ {{ a.name }}</p>
            <p v-for="r in it.removed" :key="r">− sin {{ r.toLowerCase() }}</p>
            <p v-if="it.note" class="italic">“{{ it.note }}”</p>
          </div>
          <!-- Cart controls -->
          <div v-if="editable" class="mt-1.5 flex items-center gap-2 pl-6">
            <div class="inline-flex items-center overflow-hidden rounded-full border border-[var(--sf-line)]">
              <button type="button" class="grid size-7 place-items-center text-[var(--sf-text)] transition hover:bg-[var(--sf-line)]" aria-label="Quitar uno" @click="emit('dec', it.uid)">
                <i class="pi pi-minus text-[10px]" />
              </button>
              <span class="w-6 text-center font-mono text-[12px] tabular-nums">{{ it.quantity }}</span>
              <button type="button" class="grid size-7 place-items-center text-[var(--sf-text)] transition hover:bg-[var(--sf-line)]" aria-label="Agregar uno" @click="emit('inc', it.uid)">
                <i class="pi pi-plus text-[10px]" />
              </button>
            </div>
            <button type="button" class="font-mono text-[11px] uppercase tracking-wide text-[var(--sf-muted)] underline-offset-2 transition hover:text-[var(--sf-primary)] hover:underline" @click="emit('edit', it.uid)">
              Editar
            </button>
            <button type="button" class="ml-auto font-mono text-[11px] uppercase tracking-wide text-[var(--sf-muted)] transition hover:text-[var(--sf-text)]" aria-label="Eliminar" @click="emit('remove', it.uid)">
              <i class="pi pi-trash text-[11px]" />
            </button>
          </div>
        </li>
      </ul>

      <template v-if="items.length">
        <div class="sf-rule my-3" />
        <!-- Totals -->
        <dl class="flex flex-col gap-1 font-mono text-[13px]">
          <div class="flex justify-between text-[var(--sf-muted)]">
            <dt>Subtotal</dt>
            <dd class="tabular-nums">{{ formatCOP(subtotal) }}</dd>
          </div>
          <div v-if="deliveryFee > 0" class="flex justify-between text-[var(--sf-muted)]">
            <dt>Domicilio</dt>
            <dd class="tabular-nums">{{ formatCOP(deliveryFee) }}</dd>
          </div>
          <div v-else-if="deliveryPending" class="flex justify-between text-[var(--sf-muted)]">
            <dt>Domicilio</dt>
            <dd class="text-[11px] uppercase tracking-wide">Por confirmar</dd>
          </div>
          <div class="mt-1 flex items-baseline justify-between border-t border-dashed border-[var(--sf-line)] pt-2 text-[var(--sf-text)]">
            <dt class="font-sans text-sm font-bold uppercase tracking-wide">
              {{ deliveryPending ? 'Subtotal' : 'Total' }}
            </dt>
            <dd class="text-lg font-bold tabular-nums text-[var(--sf-primary)]">{{ formatCOP(total) }}</dd>
          </div>
          <p v-if="deliveryPending" class="pt-1 text-[11px] leading-snug text-[var(--sf-muted)]">
            Calculamos el domicilio según tu ubicación y te mandamos el total con el enlace de
            pago por WhatsApp.
          </p>
        </dl>

        <!-- Fulfillment / payment recap (summary + final) -->
        <div v-if="fulfillmentLabel || paymentLabel" class="sf-rule my-3" />
        <div v-if="fulfillmentLabel || paymentLabel" class="flex flex-col gap-1 font-mono text-[11px] text-[var(--sf-muted)]">
          <p v-if="fulfillmentLabel"><i class="pi pi-map-marker text-[10px]" /> {{ fulfillmentLabel }}</p>
          <p v-if="paymentLabel"><i class="pi pi-wallet text-[10px]" /> {{ paymentLabel }}</p>
        </div>

        <p v-if="variant === 'final'" class="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-[var(--sf-muted)]">
          ¡Gracias por tu pedido!
        </p>
      </template>
    </div>
    <div class="sf-perf sf-perf--bottom" />
  </div>
</template>

<style scoped>
/* Thermal-paper chit: paper body between two scalloped edges. Colors come from the theme vars set
   on the storefront root. */
.sf-ticket {
  /* --sf-paper / --sf-line inherit from the storefront root's theme vars. */
  filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.14));
}
.sf-perf {
  height: 8px;
  background: var(--sf-paper);
  -webkit-mask-size: 16px 8px;
  mask-size: 16px 8px;
  -webkit-mask-repeat: repeat-x;
  mask-repeat: repeat-x;
}
/* Half-circles bitten out of the top edge. */
.sf-perf--top {
  -webkit-mask-image: radial-gradient(circle at 8px 0, transparent 5px, #000 5.5px);
  mask-image: radial-gradient(circle at 8px 0, transparent 5px, #000 5.5px);
}
.sf-perf--bottom {
  -webkit-mask-image: radial-gradient(circle at 8px 8px, transparent 5px, #000 5.5px);
  mask-image: radial-gradient(circle at 8px 8px, transparent 5px, #000 5.5px);
}
/* Dashed receipt rule. */
.sf-rule {
  border-top: 1px dashed var(--sf-line);
}
</style>
