<script setup lang="ts">
// Un mensaje del hilo. Tres autorías, tres pesos visuales, y el RELLENO como jerarquía:
//
//   contacto    → gris hundido, a la izquierda
//   automático  → derecha, borde ember, SIN relleno
//   agente      → derecha, relleno ember-50
//
// Que el automático vaya a la derecha es una corrección, no una preferencia: antes se pintaba
// como una pastilla centrada, o sea como cromo del sistema. Pero el saludo, la respuesta de una
// FAQ y el "va en camino" **el cliente los recibió como mensajes del negocio**. Esconderlos en una
// pastillita miente sobre lo que pasó en ese chat, que es justo lo que un agente viene a leer.
import { computed } from 'vue'
import type { Message } from '@/services/messaging.api'

const props = defineProps<{ message: Message; holderName?: string | null }>()

const kind = computed<'contact' | 'automatic' | 'agent'>(() => {
  if (props.message.sender_type === 'contact') return 'contact'
  return props.message.sender_type === 'system' ? 'automatic' : 'agent'
})

const time = computed(() =>
  new Date(props.message.sent_at).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  }),
)

/** El archivo, si trajo uno y se pudo guardar. */
const hasImage = computed(
  () => Boolean(props.message.media_url) && props.message.media_type === 'image',
)
const hasFile = computed(
  () => Boolean(props.message.media_url) && props.message.media_type !== 'image',
)
/** Llegó un archivo y no se pudo traer: se dice, no se deja un hueco. */
const lostFile = computed(() => !props.message.media_url && Boolean(props.message.media_type))
</script>

<template>
  <li
    class="flex"
    :class="kind === 'contact' ? 'justify-start' : 'justify-end'"
    :data-message="message.id"
    :data-kind="kind"
  >
    <div
      class="max-w-[85%] rounded-2xl px-3.5 py-2.5 sm:max-w-[75%]"
      :class="{
        'rounded-tl-sm bg-sunken text-ink': kind === 'contact',
        'rounded-tr-sm border border-ember/40 bg-transparent text-ink': kind === 'automatic',
        'rounded-tr-sm bg-ember-50 text-ink': kind === 'agent',
      }"
    >
      <a
        v-if="hasImage"
        :href="message.media_url!"
        target="_blank"
        rel="noopener"
        class="mb-2 block overflow-hidden rounded-xl border border-line/70"
        :data-media="message.id"
        title="Abrir a tamaño completo"
      >
        <!-- Alto generoso: esto se usa para leer el importe de un comprobante, y una miniatura
             obliga a abrirlo siempre. -->
        <img
          :src="message.media_url!"
          alt="Archivo enviado por el cliente"
          class="max-h-72 w-full bg-sunken object-contain"
        />
      </a>

      <a
        v-else-if="hasFile"
        :href="message.media_url!"
        target="_blank"
        rel="noopener"
        class="mb-2 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink transition hover:border-ember/50"
        :data-media="message.id"
      >
        <i class="pi pi-file-pdf text-sm text-steel-500" />
        <span class="min-w-0 flex-1 truncate">Abrir el archivo</span>
        <i class="pi pi-external-link text-[11px] text-steel-400" />
      </a>

      <p
        v-else-if="lostFile"
        class="mb-2 rounded-xl border border-dashed border-line px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-400"
        :data-media-missing="message.id"
      >
        Llegó {{ message.media_type === 'image' ? 'una imagen' : 'un archivo' }} y no se pudo
        traer. Mírala en WhatsApp.
      </p>

      <p
        v-if="message.content"
        class="whitespace-pre-wrap break-words text-[14px] leading-snug"
      >
        {{ message.content }}
      </p>

      <p
        v-if="message.proof_of_order"
        class="mt-1.5 font-mono text-[10px] text-steel-400"
        :data-proof-used="message.id"
      >
        Ya es el comprobante del pedido {{ message.proof_of_order }}.
      </p>

      <slot name="actions" />

      <p
        class="mt-1.5 flex items-center justify-end gap-2 font-mono text-[9px] uppercase tracking-wide text-steel-400"
      >
        <!-- Quién lo escribió. El automático se marca; el agente se firma. -->
        <span v-if="kind === 'automatic'" class="text-ember-600" data-testid="automatic-tag">
          Automático
        </span>
        <span v-else-if="kind === 'agent' && holderName">{{ holderName }}</span>

        <span class="tabular-nums normal-case tracking-normal">{{ time }}</span>

        <!-- Estado de salida. Sólo lo que el puente nos dice de verdad, ni un paso más: un tick
             que promete algo que nadie comprobó es peor que ningún tick. Desde que escuchamos
             `MESSAGES_UPDATE`, "de verdad" incluye entregado y leído.

             El leído va en ember —el acento de la casa— y no en el azul de WhatsApp: el ✓✓ ya
             lleva encima la asociación, y copiar el azul mete la marca de otro en esta pantalla.
             El color nunca es la única diferencia: cambia también el número de palomitas y
             siempre hay `aria-label` que lo dice en palabras. -->
        <template v-if="kind !== 'contact'">
          <span v-if="message.delivery_state === 'failed'" class="text-alert" data-failed>
            No enviado
          </span>
          <span v-else-if="message.delivery_state === 'pending'">Enviando…</span>
          <i
            v-else-if="message.delivery_state === 'read'"
            class="pi pi-check-circle text-[9px] text-ember-600"
            aria-label="Leído"
            data-testid="receipt-read"
          />
          <i
            v-else-if="message.delivery_state === 'delivered'"
            class="pi pi-check-circle text-[9px] text-steel-400"
            aria-label="Entregado"
            data-testid="receipt-delivered"
          />
          <i
            v-else
            class="pi pi-check text-[9px] text-steel-400"
            aria-label="Enviado"
            data-testid="receipt-sent"
          />
        </template>
      </p>
    </div>
  </li>
</template>
