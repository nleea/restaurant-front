<script setup lang="ts">
// El hilo: los mensajes en orden, con un separador cada vez que cambia el día.
//
// Sólo compone. Cada mensaje sabe pintarse a sí mismo (`MessageBubble`), y la acción de usar un
// archivo como comprobante entra por un slot: el hilo no tiene por qué saber de pedidos ni de
// pagos, y meterle esa lógica aquí sería atarlo a un flujo que no es suyo.
import { computed } from 'vue'
import type { Message, Thread } from '@/services/messaging.api'
import MessageBubble from '@/components/messaging/MessageBubble.vue'

const props = defineProps<{ thread: Thread }>()

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

/** Un separador cada vez que cambia el día, para que un hilo largo siga siendo navegable. */
const rows = computed(() => {
  let lastDay = ''
  return props.thread.messages.map((m: Message) => {
    const day = m.sent_at.slice(0, 10)
    const showDay = day !== lastDay
    lastDay = day
    return { message: m, showDay }
  })
})
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
    <p v-if="!rows.length" class="text-center text-sm text-steel-500">Sin mensajes.</p>

    <ul v-else class="flex flex-col gap-2.5">
      <template v-for="{ message, showDay } in rows" :key="message.id">
        <li v-if="showDay" class="my-2 flex items-center gap-3">
          <span class="h-px flex-1 bg-hairline" aria-hidden="true" />
          <span
            class="font-mono text-[10px] uppercase tracking-[0.16em] capitalize text-steel-400"
          >
            {{ dayLabel(message.sent_at) }}
          </span>
          <span class="h-px flex-1 bg-hairline" aria-hidden="true" />
        </li>

        <MessageBubble :message="message" :holder-name="thread.holder_name">
          <template #actions>
            <slot name="message-actions" :message="message" />
          </template>
        </MessageBubble>
      </template>
    </ul>
  </div>
</template>
