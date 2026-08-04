<script setup lang="ts">
// Summary step: the full comanda plus fulfillment + payment recap, then confirm. Reuses the ticket
// in its read-only variant.
import { computed } from 'vue'
import { useCartStore } from '@/stores/cart'
import { mockPaymentMethods } from '@/mock/paymentMethods'
import { PICKUP_ADDRESS } from '@/lib/storefront'
import OrderTicket from '@/components/storefront/OrderTicket.vue'

defineProps<{
  restaurantName: string
  submitting?: boolean
  error?: boolean
  // Overrides the default error copy (e.g. "caja cerrada"); falls back to the generic message.
  errorMessage?: string
}>()
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'back'): void }>()
const cart = useCartStore()

const fulfillmentLabel = computed(() => {
  if (cart.fulfillment === 'pickup') return `Recoger · ${PICKUP_ADDRESS}`
  if (cart.locationMode === 'gps') return 'Domicilio · ubicación GPS'
  const a = cart.address
  return `Domicilio · ${[a.street, a.number].filter(Boolean).join(' ')}, ${a.neighborhood}`
})
const paymentLabel = computed(
  () => mockPaymentMethods.find((m) => m.id === cart.paymentMethodId)?.label ?? 'Sin definir',
)
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
    <OrderTicket
      :restaurant-name="restaurantName"
      :items="cart.items"
      :subtotal="cart.subtotal"
      :delivery-fee="cart.deliveryFee"
      :delivery-pending="cart.fulfillment === 'delivery'"
      :total="cart.total"
      variant="summary"
      :fulfillment-label="fulfillmentLabel"
      :payment-label="paymentLabel"
    />

    <p v-if="error" role="alert" class="rounded-lg bg-[color-mix(in_oklab,red_10%,var(--sf-surface))] px-3 py-2 text-center text-[12px] text-[var(--sf-text)]">
      {{ errorMessage || 'No pudimos enviar tu pedido. Revisa tu conexión e inténtalo de nuevo.' }}
    </p>
    <button
      type="button"
      :disabled="submitting"
      class="w-full rounded-full bg-[var(--sf-primary)] py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2"
      @click="emit('confirm')"
    >
      {{ submitting ? 'Enviando…' : 'Confirmar pedido' }}
    </button>
  </div>
</template>
