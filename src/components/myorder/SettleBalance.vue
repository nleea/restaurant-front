<script setup lang="ts">
// Cómo se paga lo que falta. Dos caminos y ninguno cobra: esta pantalla entrega un papel.
//
// - **Adjuntar el comprobante** aquí mismo.
// - **Mandarlo por el WhatsApp del negocio**, que es la ruta que la gente ya usa y la única que
//   sirve cuando la subida falla o el comprobante está en otro teléfono.
//
// Y una frase que no puede faltar: enviado NO es pagado. Mientras el restaurante no lo confirme,
// el saldo sigue siendo el saldo — decir otra cosa es prometerle al cliente algo que la puerta
// va a desmentir.
import { computed, ref } from 'vue'
import { formatCOP } from '@/lib/money'
import { MAX_PROOF_BYTES, PROOF_ACCEPT } from '@/services/paymentProof.api'

const props = defineProps<{
  /** Lo que falta por pagar. Nunca el total del pedido. */
  outstanding: number
  /** Ya mandó uno y nadie lo ha mirado. */
  pending: boolean
  whatsappHref: string | null
  busy: boolean
  error: string | null
}>()
const emit = defineEmits<{ (e: 'send', file: File): void }>()

const fileInput = ref<HTMLInputElement | null>(null)
const tooBig = ref(false)

const label = computed(() => `Enviar comprobante de ${formatCOP(props.outstanding)}`)

function pick(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  if (!file) return
  tooBig.value = file.size > MAX_PROOF_BYTES
  if (!tooBig.value) emit('send', file)
}
</script>

<template>
  <div class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-4">
    <p class="text-[13px] font-semibold">
      Falta por pagar <span class="tabular-nums">{{ formatCOP(outstanding) }}</span>
    </p>

    <p v-if="pending" class="mt-1 text-[12px] text-[var(--sf-muted)]">
      Ya recibimos un comprobante y el restaurante lo está confirmando. Te avisamos en cuanto
      esté; hasta entonces la cuenta sigue como está.
    </p>
    <p v-else class="mt-1 text-[12px] text-[var(--sf-muted)]">
      Manda el comprobante y el restaurante lo confirma. No se cobra desde aquí.
    </p>

    <input ref="fileInput" type="file" class="hidden" :accept="PROOF_ACCEPT" @change="pick" />

    <div class="mt-3 flex flex-col gap-2">
      <button
        type="button"
        class="w-full rounded-full bg-[var(--sf-primary)] py-3 text-[14px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
        :disabled="busy"
        @click="fileInput?.click()"
      >
        <i class="pi pi-paperclip text-[12px]" />
        {{ busy ? 'Enviando…' : label }}
      </button>

      <a
        v-if="whatsappHref"
        :href="whatsappHref"
        target="_blank"
        rel="noopener"
        class="w-full rounded-full border border-[var(--sf-line)] py-3 text-center text-[14px] font-medium text-[var(--sf-text)]"
      >
        <i class="pi pi-whatsapp text-[12px]" /> Mandarlo por WhatsApp
      </a>
    </div>

    <p v-if="tooBig" role="alert" class="mt-2 text-[12px] text-[var(--sf-primary)]">
      Ese archivo pesa demasiado (máximo 5 MB). Prueba con una captura de pantalla.
    </p>
    <p v-else-if="error" role="alert" class="mt-2 text-[12px] text-[var(--sf-primary)]">
      {{ error }}
    </p>
  </div>
</template>
