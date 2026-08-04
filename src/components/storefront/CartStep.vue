<script setup lang="ts">
// Cart step: the comanda so far, as an editable ticket. Change quantities or remove lines inline,
// tap Editar to reopen a line's detail, then continue to fulfillment.
import { useCartStore } from '@/stores/cart'
import OrderTicket from '@/components/storefront/OrderTicket.vue'

defineProps<{ restaurantName: string }>()
const emit = defineEmits<{ (e: 'edit', uid: string): void; (e: 'next'): void; (e: 'back'): void }>()

const cart = useCartStore()

function dec(uid: string) {
  const item = cart.items.find((it) => it.uid === uid)
  if (item) cart.setQuantity(uid, item.quantity - 1)
}
function inc(uid: string) {
  const item = cart.items.find((it) => it.uid === uid)
  if (item) cart.setQuantity(uid, item.quantity + 1)
}
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
      variant="cart"
      @edit="emit('edit', $event)"
      @inc="inc"
      @dec="dec"
      @remove="cart.removeItem($event)"
    />

    <button
      type="button"
      class="w-full rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] py-3 text-[14px] font-medium text-[var(--sf-text)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
      @click="emit('back')"
    >
      <i class="pi pi-plus text-xs" /> Agregar más platos
    </button>

    <button
      type="button"
      :disabled="cart.isEmpty"
      class="w-full rounded-full bg-[var(--sf-primary)] py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2"
      @click="emit('next')"
    >
      Continuar
    </button>
  </div>
</template>
