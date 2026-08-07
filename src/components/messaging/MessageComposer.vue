<script setup lang="ts">
// Escribir la respuesta.
//
// Dos reglas, y las dos son sobre no perder trabajo ajeno:
//
// 1. **El borrador no se borra si el envío falla.** Se limpia sólo cuando el padre confirma que
//    salió. Un agente que escribe cuatro líneas y las pierde por un puente caído no vuelve a
//    confiar en la pantalla.
// 2. **Con el número desconectado no se escribe.** Se dice por qué y se bloquea: dejar escribir
//    mensajes que no van a salir es peor que no dejar escribir, porque el agente cree que contestó.
import { computed, nextTick, ref, watch } from 'vue'
import { SENDABLE_TYPES, type QuickReply } from '@/services/messaging.api'
import { insertIntoDraft } from '@/lib/quickReplies'
import type { ConnectionStatus } from '@/components/messaging/ConversationHeader.vue'

const props = defineProps<{
  canAttend: boolean
  isClosed: boolean
  sending: boolean
  error: string | null
  connectionStatus: ConnectionStatus
  /** Las plantillas del tenant. Vacío = no se pinta el botón. */
  quickReplies?: QuickReply[]
}>()

const emit = defineEmits<{ send: [body: string]; sendFile: [file: File, caption: string] }>()

const draft = ref('')
const picker = ref<HTMLInputElement | null>(null)
/** El archivo elegido, esperando a que pulse enviar. Se ve antes de salir. */
const attached = ref<File | null>(null)

const offline = computed(() => props.connectionStatus === 'disconnected')
const ready = computed(() => props.canAttend && !props.isClosed && !offline.value && !props.sending)
const canSend = computed(
  () => ready.value && (Boolean(attached.value) || draft.value.trim().length > 0),
)

/** Se limpia cuando el envío TERMINA sin error, nunca al pulsar. */
watch(
  () => props.sending,
  (now, before) => {
    if (before && !now && !props.error) {
      draft.value = ''
      attached.value = null
    }
  },
)

function pick(event: Event): void {
  const input = event.target as HTMLInputElement
  attached.value = input.files?.[0] ?? null
  // Se limpia el input para que elegir DOS VECES el mismo archivo vuelva a disparar el evento.
  input.value = ''
}

// --- Respuestas rápidas ------------------------------------------------------
// Insertan, NO envían: un toque equivocado no le llega a nadie, y ésa es la propiedad que
// permite poner el botón al lado del de enviar.
const input = ref<HTMLTextAreaElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const pickerOpen = ref(false)

/** Sin plantillas no hay botón: un menú vacío sin explicación es peor que ningún menú. */
const hasQuickReplies = computed(() => (props.quickReplies?.length ?? 0) > 0)

function toggleQuickReplies(): void {
  pickerOpen.value = !pickerOpen.value
}

function closeQuickReplies(): void {
  if (!pickerOpen.value) return
  pickerOpen.value = false
  trigger.value?.focus()
}

async function useQuickReply(entry: QuickReply): Promise<void> {
  const field = input.value
  // El cursor real si el `textarea` está montado; si no, el final del borrador. Nunca 0, que
  // metería la plantilla DELANTE de lo escrito.
  const caret = field?.selectionStart ?? draft.value.length
  const { text, caret: next } = insertIntoDraft(draft.value, entry.text, caret)
  draft.value = text
  pickerOpen.value = false
  // El foco vuelve al texto para poder editarlo en el momento, y el cursor queda al final de lo
  // insertado: es lo que hace que dos plantillas seguidas se concatenen en el orden esperado.
  await nextTick()
  field?.focus()
  field?.setSelectionRange(next, next)
}

function submit(): void {
  if (attached.value) {
    // Con archivo, el texto viaja como pie de foto: son un solo mensaje para el cliente, y
    // mandarlos por separado le llegarían desordenados.
    if (props.sending) return
    emit('sendFile', attached.value, draft.value.trim())
    return
  }
  if (!canSend.value) return
  emit('send', draft.value.trim())
}
</script>

<template>
  <footer class="shrink-0 border-t border-line px-4 py-3">
    <p
      v-if="!canAttend"
      class="text-center font-mono text-[11px] text-steel-500"
    >
      Solo lectura: no tienes permiso para responder.
    </p>

    <p v-else-if="isClosed" class="text-center font-mono text-[11px] text-steel-500">
      La conversación está cerrada.
    </p>

    <template v-else>
      <p
        v-if="error"
        role="alert"
        class="mb-2 flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 text-[13px] text-alert"
        data-testid="composer-error"
      >
        <i class="pi pi-exclamation-circle mt-0.5 text-[11px]" />
        <span>{{ error }} Tu mensaje sigue escrito: vuelve a enviarlo.</span>
      </p>

      <!-- Desconectado: se dice antes de que escriba, no después de que pulse enviar. -->
      <p
        v-if="offline"
        class="mb-2 flex items-start gap-2 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 text-[13px] text-alert"
        data-testid="composer-offline"
      >
        <i class="pi pi-exclamation-circle mt-0.5 text-[11px]" />
        <span>
          El número está desconectado. Vuelve a vincularlo en Ajustes de WhatsApp para poder
          responder.
        </span>
      </p>

      <!-- Lo que va a salir, antes de que salga. Un adjunto invisible es un adjunto que se manda
           por accidente. -->
      <div
        v-if="attached"
        class="mb-2 flex items-center gap-2 rounded-lg border border-line bg-app px-3 py-2 text-[13px]"
        data-testid="composer-attachment"
      >
        <i class="pi pi-paperclip text-[11px] text-steel-500" />
        <span class="min-w-0 flex-1 truncate text-ink">{{ attached.name }}</span>
        <button
          type="button"
          class="font-mono text-[10px] uppercase tracking-wide text-steel-400 transition hover:text-alert"
          data-testid="composer-detach"
          @click="attached = null"
        >
          Quitar
        </button>
      </div>

      <!-- El popover de plantillas. Vive fuera del `form` para que Enter dentro de la lista no
           dispare el envío. -->
      <div v-if="hasQuickReplies && ready" class="relative">
        <button
          ref="trigger"
          type="button"
          class="mb-2 flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
          aria-haspopup="listbox"
          :aria-expanded="pickerOpen"
          data-testid="quick-reply-trigger"
          @click="toggleQuickReplies"
        >
          <i class="pi pi-bolt text-[10px]" />
          Respuestas rápidas
        </button>

        <template v-if="pickerOpen">
          <!-- Clic fuera cierra. Un `div` a pantalla completa por debajo del menú: sin listeners
               en `document`, que sobreviven al desmontaje si alguien olvida quitarlos. -->
          <div class="fixed inset-0 z-10" data-testid="quick-reply-backdrop" @click="closeQuickReplies" />
          <ul
            role="listbox"
            aria-label="Respuestas rápidas"
            class="absolute bottom-full z-20 mb-1 max-h-64 w-full max-w-sm overflow-y-auto rounded-xl border border-line bg-paper py-1 shadow-lg"
            data-testid="quick-reply-list"
            @keydown.escape="closeQuickReplies"
          >
            <li v-for="entry in quickReplies" :key="entry.id" role="option">
              <button
                type="button"
                class="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-app"
                :data-testid="`quick-reply-${entry.id}`"
                @click="useQuickReply(entry)"
              >
                <span class="font-mono text-[10px] uppercase tracking-[0.12em] text-steel-500">
                  {{ entry.name }}
                </span>
                <span class="truncate text-[13px] text-ink">{{ entry.text }}</span>
              </button>
            </li>
          </ul>
        </template>
      </div>

      <form class="flex items-end gap-2" @submit.prevent="submit">
        <input
          ref="picker"
          type="file"
          class="sr-only"
          :accept="SENDABLE_TYPES"
          data-testid="composer-file"
          @change="pick"
        />
        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-40"
          :disabled="!ready"
          aria-label="Adjuntar imagen o PDF"
          data-testid="composer-attach"
          @click="picker?.click()"
        >
          <i class="pi pi-paperclip text-sm" />
        </button>
        <textarea
          ref="input"
          v-model="draft"
          rows="2"
          :disabled="offline"
          :placeholder="offline ? 'Sin conexión' : attached ? 'Añade un texto (opcional)…' : 'Escribe una respuesta…'"
          data-testid="composer-input"
          class="min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-app px-3 py-2 text-sm text-ink outline-none transition placeholder:text-steel-400 focus:border-ember/60 disabled:cursor-not-allowed disabled:opacity-60"
          @keydown.enter.exact.prevent="submit"
        />
        <button
          type="submit"
          class="grid size-10 shrink-0 place-items-center rounded-xl bg-ember text-white transition hover:bg-ember-600 disabled:opacity-40"
          :disabled="!canSend"
          :aria-label="sending ? 'Enviando respuesta' : 'Enviar respuesta'"
          data-testid="composer-send"
        >
          <!-- La carga vive en el botón: el input sigue vivo para poder corregir mientras sale. -->
          <i
            :class="sending ? 'pi pi-spinner motion-safe:animate-spin' : 'pi pi-send'"
            class="text-sm"
          />
        </button>
      </form>
    </template>
  </footer>
</template>
