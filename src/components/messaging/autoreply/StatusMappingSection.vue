<script setup lang="ts">
// Qué momentos del pedido le hablan al cliente.
//
// La pantalla existe para hacer visible un coste que no se ve al encender un interruptor:
// cada aviso gasta cuota del número, y un número que manda ocho mensajes por pedido es
// exactamente la conducta que hace que WhatsApp lo mire y que el cliente silencie el chat.
// Por eso el contador no es decoración — es la advertencia.
import { computed } from 'vue'
import type { StatusMessage } from '@/services/messaging.api'
import {
  braced,
  bracedList,
  RECOMMENDED_MAX_MESSAGES,
  TRANSITIONS,
  TRANSITION_HINT,
  TRANSITION_LABEL,
  typicalMessageCount,
  unknownPlaceholders,
} from '@/lib/whatsappAutoreply'

const mapping = defineModel<Record<string, StatusMessage>>('mapping', { required: true })

const props = defineProps<{
  /** Los marcadores válidos en un aviso de pedido (`{menu_link}` NO lo es). */
  placeholders: string[]
  disabled: boolean
}>()

const emit = defineEmits<{ (e: 'restore'): void }>()

const count = computed(() => typicalMessageCount(mapping.value))
const tooChatty = computed(() => count.value > RECOMMENDED_MAX_MESSAGES)

const rows = computed(() =>
  TRANSITIONS.map((state) => ({
    state,
    label: TRANSITION_LABEL[state],
    hint: TRANSITION_HINT[state],
    entry: mapping.value[state] ?? { enabled: false, text: '' },
    unknown: unknownPlaceholders(mapping.value[state]?.text ?? '', props.placeholders),
  })),
)

function toggle(state: string): void {
  const entry = mapping.value[state]
  if (entry) entry.enabled = !entry.enabled
}

function setText(state: string, text: string): void {
  const entry = mapping.value[state]
  if (entry) entry.text = text
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="font-display text-lg font-extrabold text-ink">Avisos del pedido</h2>
        <p class="mt-0.5 text-sm text-steel-500">
          Sólo los momentos que enciendas le escriben al cliente. Lo demás —"en preparación",
          "asignando"— pasa en silencio.
        </p>
      </div>
      <button
        type="button"
        :disabled="disabled"
        class="shrink-0 rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
        data-testid="restore-mapping"
        @click="emit('restore')"
      >
        Volver a los de fábrica
      </button>
    </header>

    <!-- El contador: cuántos mensajes vive un cliente en un pedido normal -->
    <p
      class="mt-3 rounded-lg border px-3 py-2 font-mono text-[11px] leading-relaxed"
      :class="
        tooChatty
          ? 'border-alert/40 bg-alert/5 text-alert'
          : 'border-line bg-app text-steel-500'
      "
      :role="tooChatty ? 'alert' : 'status'"
      data-testid="message-count"
    >
      Un pedido normal manda
      <strong class="tabular-nums">{{ count }}</strong>
      {{ count === 1 ? 'mensaje' : 'mensajes' }}.
      <span v-if="tooChatty" data-testid="chatty-warning">
        Por encima de {{ RECOMMENDED_MAX_MESSAGES }} el volumen de salida es lo que pone en
        riesgo el número: WhatsApp bloquea cuentas por esto, y el cliente silencia el chat
        antes.
      </span>
    </p>

    <ul class="mt-4 flex flex-col gap-2">
      <li
        v-for="row in rows"
        :key="row.state"
        class="rounded-lg border bg-app p-3"
        :class="row.entry.enabled ? 'border-ember/30' : 'border-line'"
        :data-transition="row.state"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-ink">{{ row.label }}</p>
            <p class="mt-0.5 font-mono text-[10px] leading-relaxed text-steel-400">
              {{ row.hint }}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="row.entry.enabled"
            :aria-label="row.label"
            :disabled="disabled"
            class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
            :class="row.entry.enabled ? 'bg-success' : 'bg-steel-300'"
            @click="toggle(row.state)"
          >
            <span
              class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
              :class="row.entry.enabled ? 'left-[22px]' : 'left-0.5'"
            />
          </button>
        </div>

        <template v-if="row.entry.enabled">
          <textarea
            :value="row.entry.text"
            rows="2"
            :disabled="disabled"
            :aria-label="`Mensaje de: ${row.label}`"
            class="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
            @input="setText(row.state, ($event.target as HTMLTextAreaElement).value)"
          />
          <div class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="p in placeholders"
              :key="`${row.state}-${p}`"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel-400"
            >
              {{ braced(p) }}
            </span>
          </div>
          <p v-if="row.unknown.length" role="alert" class="mt-1 font-mono text-[11px] text-alert">
            No existe {{ bracedList(row.unknown) }} en un aviso de pedido.
          </p>
        </template>
      </li>
    </ul>
  </section>
</template>
