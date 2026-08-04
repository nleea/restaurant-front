<script setup lang="ts">
// Confirmation: the comanda "printed" — the final ticket with the order number stamped and an
// initial status. Mock only; no backend. Starting another order resets the cart.
import { computed } from 'vue'
import { useCartStore } from '@/stores/cart'
import OrderTicket from '@/components/storefront/OrderTicket.vue'
import { waitingCopy } from '@/lib/orderWaitingState'

const props = defineProps<{ restaurantName: string; whatsappHref?: string | null }>()
const emit = defineEmits<{ (e: 'restart'): void }>()
const cart = useCartStore()

// Snapshot for the printed ticket (the cart resets when a new order starts).
const items = computed(() => cart.items)

// Un prepago sin verificar NO está «En preparación»: la cocina no lo ha visto. Decir que sí es lo
// que produce el "¿ya está listo?" y la decepción en la puerta. La frase se deriva en un solo sitio
// y la comparte con «mi pedido».
const waiting = computed(() =>
  waitingCopy({
    paymentMethod: cart.paymentMethodId,
    // Recién confirmado no hay ningún pago registrado: debe el total.
    balance: cart.total,
    // Si adjuntó algo, ya está esperando que alguien lo mire.
    proofPending: Boolean(cart.paymentProof) && !cart.paymentProofError,
  }),
)
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-8">
    <div class="flex flex-col items-center gap-2 text-center">
      <span class="grid size-14 place-items-center rounded-full bg-[color-mix(in_oklab,var(--sf-primary)_16%,transparent)] motion-safe:animate-[sfPop_0.4s_cubic-bezier(0.2,0.9,0.3,1.4)]">
        <i class="pi pi-check text-2xl text-[var(--sf-primary)]" />
      </span>
      <h2 class="text-xl font-bold text-[var(--sf-text)]">¡Pedido recibido!</h2>
      <p class="text-[13px] text-[var(--sf-muted)]">
        {{ waiting.state === 'normal' ? 'Te avisaremos cuando esté en camino.' : waiting.detail }}
      </p>
    </div>

    <div class="w-full max-w-xs motion-safe:animate-[sfPrint_0.5s_ease-out]">
      <OrderTicket
        :restaurant-name="restaurantName"
        :items="items"
        :subtotal="cart.subtotal"
        :delivery-fee="cart.deliveryFee"
      :delivery-pending="cart.fulfillment === 'delivery'"
        :total="cart.total"
        variant="final"
        :order-number="cart.orderNumber"
      />
    </div>

    <span class="inline-flex items-center gap-1.5 rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-[var(--sf-text)]">
      <span class="size-2 rounded-full bg-[var(--sf-secondary)]" />
      <span data-testid="order-state">
        {{ waiting.label || cart.orderStatus || 'En preparación' }}
      </span>
    </span>

    <!-- La ruta que la gente usa de verdad: el banco ofrece "compartir por WhatsApp" justo cuando
         acaba de pagar. El enlace lleva el pedido y el total ESCRITOS, para que quien atiende el
         número sepa de qué es la foto que viene debajo. -->
    <a
      v-if="waiting.state === 'awaiting_payment' && props.whatsappHref"
      :href="props.whatsappHref"
      target="_blank"
      rel="noopener"
      data-testid="send-proof-whatsapp"
      class="inline-flex items-center gap-2 rounded-full bg-[var(--sf-primary)] px-4 py-2.5 text-[13px] font-semibold text-white"
    >
      <i class="pi pi-whatsapp text-[13px]" /> Mandar el comprobante por WhatsApp
    </a>

    <!-- Qué pasó con el comprobante. Se dice SIEMPRE que se intentó: callarlo cuando falla es
         dejar al cliente creyendo que ya pagó. -->
    <p
      v-if="cart.paymentProofError"
      class="w-full max-w-xs rounded-xl border border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_10%,transparent)] px-4 py-3 text-[13px]"
    >
      {{ cart.paymentProofError }}
    </p>
    <p
      v-else-if="cart.paymentProof"
      class="w-full max-w-xs text-center text-[12px] text-[var(--sf-muted)]"
    >
      Recibimos tu comprobante. El restaurante lo confirma y te avisa.
    </p>

    <!-- El enlace para corregirlo. Va aquí porque quien pidió por la web no recibe nada por
         WhatsApp: sin esto, el único camino a "mi pedido" sería el chat, y no todos lo tienen. -->
    <RouterLink
      v-if="cart.orderEditToken"
      :to="{ name: 'myOrder', params: { token: cart.orderEditToken } }"
      class="w-full max-w-xs rounded-full bg-[var(--sf-primary)] py-3 text-center font-medium text-white transition active:scale-[0.99]"
    >
      ¿Se te olvidó algo? Corregir mi pedido
    </RouterLink>

    <button
      type="button"
      class="w-full max-w-xs rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] py-3 font-medium text-[var(--sf-text)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
      @click="emit('restart')"
    >
      Hacer otro pedido
    </button>
  </div>
</template>

<style scoped>
@keyframes sfPop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes sfPrint {
  from {
    clip-path: inset(0 0 100% 0);
    transform: translateY(-8px);
  }
  to {
    clip-path: inset(0 0 0 0);
    transform: translateY(0);
  }
}
</style>
