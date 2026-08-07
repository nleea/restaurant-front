<script setup lang="ts">
// Payment step: the methods the restaurant accepts (from a mock the admin will one day configure).
// Selecting one reveals its details; the ones that need a receipt (e.g. transfer) let the customer
// attach it.
//
// El archivo NO se sube aquí: se guarda en el carrito y viaja cuando el pedido ya existe, porque
// la puerta del comprobante se abre con el token del pedido. Adjuntar aquí y subir después es lo
// que evita un endpoint de subida sin dueño.
import { computed, ref } from 'vue'
import { useCartStore } from '@/stores/cart'
import { mockPaymentMethods } from '@/mock/paymentMethods'
import { MAX_PROOF_BYTES, PROOF_ACCEPT } from '@/services/paymentProof.api'

const props = defineProps<{
  /** QR de pago del negocio (de la marca). Vacío = no lo han subido todavía. */
  paymentQrUrl?: string
  /** WhatsApp de la sede, para mandar el comprobante por ahí si prefiere. */
  whatsappHref?: string | null
}>()
const emit = defineEmits<{ (e: 'next'): void; (e: 'back'): void }>()
const cart = useCartStore()

const selected = computed(() => mockPaymentMethods.find((m) => m.id === cart.paymentMethodId) ?? null)

const tooBig = ref(false)

function pickProof(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  // El tope se comprueba también en el servidor; aquí es para no hacerle subir 40 MB por una
  // red móvil antes de decirle que no.
  tooBig.value = file !== null && file.size > MAX_PROOF_BYTES
  cart.setPaymentProof(tooBig.value ? null : file)
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-3 px-4 py-4">
    <div v-for="m in mockPaymentMethods" :key="m.id" class="flex flex-col">
      <button
        type="button"
        class="flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition"
        :class="cart.paymentMethodId === m.id ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_8%,transparent)]' : 'border-[var(--sf-line)] bg-[var(--sf-surface)]'"
        @click="cart.setPayment(m.id)"
      >
        <i class="pi text-lg text-[var(--sf-primary)]" :class="m.icon" />
        <span class="flex-1 font-semibold text-[var(--sf-text)]">{{ m.label }}</span>
        <span
          class="grid size-5 place-items-center rounded-full border-2"
          :class="cart.paymentMethodId === m.id ? 'border-[var(--sf-primary)]' : 'border-[var(--sf-line)]'"
        >
          <span v-if="cart.paymentMethodId === m.id" class="size-2.5 rounded-full bg-[var(--sf-primary)]" />
        </span>
      </button>

      <!-- Details for the selected method -->
      <div v-if="cart.paymentMethodId === m.id && (m.info || m.needsProof)" class="mx-1 -mt-1 rounded-b-2xl border border-t-0 border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 pb-4 pt-3">
        <p v-if="m.info" class="text-[12px] leading-relaxed text-[var(--sf-muted)]">{{ m.info }}</p>
        <!-- El QR del negocio, para escanear y transferir. Es una foto real subida en Perfil
             del negocio; mientras no la suban, no se pinta un cuadrito falso que no escanea. -->
        <a
          v-if="m.needsProof && props.paymentQrUrl"
          :href="props.paymentQrUrl"
          target="_blank"
          rel="noopener"
          class="mt-3 block"
        >
          <img
            :src="props.paymentQrUrl"
            alt="QR para pagar"
            class="mx-auto max-h-56 w-auto rounded-xl border border-[var(--sf-line)] bg-white object-contain p-2"
          />
          <span class="mt-1 block text-center text-[11px] text-[var(--sf-muted)]">
            Escanéalo desde tu app del banco · toca para ampliarlo
          </span>
        </a>

        <div v-if="m.needsProof" class="mt-3 flex items-center gap-3">
          <!-- `label for` y no un `ref` + `click()`: este bloque vive dentro de un `v-for`, y
               ahí Vue convierte el ref en un ARRAY — `fileInput.click()` no existía y el botón
               no hacía absolutamente nada. Un label lo abre sin JavaScript de por medio. -->
          <input
            :id="`proof-${m.id}`"
            type="file"
            class="sr-only"
            :accept="PROOF_ACCEPT"
            @change="pickProof"
          />
          <label
            :for="`proof-${m.id}`"
            class="flex-1 cursor-pointer rounded-xl border border-dashed border-[var(--sf-line)] py-2.5 text-center text-[12px] font-medium text-[var(--sf-muted)] transition hover:border-[var(--sf-primary)] hover:text-[var(--sf-text)]"
            data-attach-proof
          >
            <i class="pi pi-paperclip text-[11px]" />
            {{ cart.paymentProof ? cart.paymentProof.name : 'Adjuntar comprobante' }}
          </label>
        </div>
        <p v-if="m.needsProof && tooBig" class="mt-2 text-[12px] text-[var(--sf-primary)]">
          Ese archivo pesa demasiado (máximo 5 MB). Prueba con una captura de pantalla.
        </p>
        <p v-else-if="m.needsProof && cart.paymentProof" class="mt-2 text-[12px] text-[var(--sf-muted)]">
          Lo mandamos con tu pedido; el restaurante lo confirma.
        </p>
        <!-- La otra ruta, la que la gente ya usa. Sigue estando aunque el adjunto falle. -->
        <a
          v-if="m.needsProof && props.whatsappHref"
          :href="props.whatsappHref"
          target="_blank"
          rel="noopener"
          class="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--sf-primary)]"
        >
          <i class="pi pi-whatsapp text-[11px]" /> O mándalo por WhatsApp
        </a>
      </div>
    </div>

    <button
      type="button"
      :disabled="!selected"
      class="mt-1 w-full rounded-full bg-[var(--sf-primary)] py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2"
      @click="emit('next')"
    >
      Revisar pedido
    </button>
  </div>
</template>
