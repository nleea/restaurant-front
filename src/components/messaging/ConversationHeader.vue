<script setup lang="ts">
// Quién es, quién lo atiende, y si el número está vivo.
//
// Ese último dato no es decoración: si la sesión de WhatsApp se cayó, el agente puede escribir
// respuestas durante diez minutos sin que salga ninguna. Saberlo ANTES de escribir es la
// diferencia entre un cliente esperando y un cliente ignorado.
import { computed } from 'vue'
import type { Thread } from '@/services/messaging.api'
import { contactLabel, contactSubtitle, isPrivacyId } from '@/lib/whatsappContact'

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

const props = defineProps<{
  thread: Thread
  canAttend: boolean
  connectionStatus: ConnectionStatus
  /** Quién está mirando: decide si el botón dice "Tomar" o "Reasignar a mí". */
  currentEmployeeId?: string | null
}>()

const emit = defineEmits<{ back: []; claim: []; close: [] }>()

const isClosed = computed(() => props.thread.status === 'closed')
const isClaimed = computed(() => props.thread.employee_id !== null)
const isMine = computed(
  () => isClaimed.value && props.thread.employee_id === props.currentEmployeeId,
)

/** Tomar algo que ya tiene otro no es "tomar": es quitárselo, y el botón tiene que decirlo. */
const claimLabel = computed(() =>
  isClaimed.value && !isMine.value ? 'Reasignar a mí' : 'Tomar',
)

const CONNECTION = {
  connected: { label: 'Conectado', dot: 'bg-success', text: 'text-steel-400' },
  reconnecting: { label: 'Reconectando', dot: 'bg-ember', text: 'text-ember-600' },
  disconnected: { label: 'Sin conexión', dot: 'bg-alert', text: 'text-alert' },
} as const
</script>

<template>
  <header class="flex items-start gap-3 border-b border-line px-4 py-3">
    <button
      type="button"
      class="-ml-1 grid size-8 shrink-0 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken lg:hidden"
      aria-label="Volver a la lista"
      @click="emit('back')"
    >
      <i class="pi pi-arrow-left text-sm" />
    </button>

    <div class="min-w-0 flex-1">
      <h3 class="truncate font-display text-lg font-extrabold leading-tight text-ink">
        {{ contactLabel(thread.contact_name, thread.contact_phone) }}
      </h3>
      <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <!-- El teléfono formateado. Con `@lid` no hay teléfono, y se dice por qué en vez de
             enseñar el identificador como si fuera uno. -->
        <span
          class="font-mono text-[11px] tabular-nums"
          :class="isPrivacyId(thread.contact_phone) ? 'text-steel-400 italic' : 'text-steel-500'"
          :title="thread.contact_phone"
          data-testid="contact-subtitle"
        >
          {{ contactSubtitle(thread.contact_phone) }}
        </span>
        <span
          v-if="thread.holder_name"
          class="font-mono text-[10px] uppercase tracking-wide text-steel-400"
        >
          · atiende {{ thread.holder_name }}
        </span>
      </p>
    </div>

    <div class="flex shrink-0 flex-col items-end gap-2">
      <!-- Estado del número. Arriba del todo porque condiciona todo lo demás. -->
      <span
        class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em]"
        :class="CONNECTION[connectionStatus].text"
        data-testid="connection-status"
      >
        <span
          class="size-1.5 rounded-full"
          :class="[
            CONNECTION[connectionStatus].dot,
            connectionStatus === 'reconnecting' ? 'motion-safe:animate-pulse' : '',
          ]"
          aria-hidden="true"
        />
        {{ CONNECTION[connectionStatus].label }}
      </span>

      <div class="flex items-center gap-2">
        <button
          v-if="canAttend && !isClosed && !isMine"
          type="button"
          class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
          :class="
            isClaimed
              ? 'border border-line text-steel-600 hover:border-ember/50 hover:text-ember-600'
              : 'bg-ember text-white hover:bg-ember-600'
          "
          data-testid="claim-button"
          @click="emit('claim')"
        >
          {{ claimLabel }}
        </button>
        <button
          v-if="canAttend && !isClosed"
          type="button"
          class="rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500 transition hover:border-alert/40 hover:text-alert"
          @click="emit('close')"
        >
          Cerrar
        </button>
        <span
          v-if="isClosed"
          class="rounded-lg bg-sunken px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500"
        >
          Cerrada
        </span>
      </div>
    </div>
  </header>
</template>
