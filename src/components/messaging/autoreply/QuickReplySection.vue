<script setup lang="ts">
// Las respuestas rápidas: las frases que el equipo repite, guardadas para no reescribirlas.
//
// **Estas NO contestan solas**, y decirlo es la obligación de esta sección. Está en la misma
// pantalla que las FAQs, que sí lo hacen, y confundirlas es el fallo de producto más probable del
// change: un dueño que crea que esto contesta por su cuenta llenará la lista de respuestas a
// preguntas que nadie va a leerle al cliente.
//
// El resto es el patrón de `FaqSection` con dos cosas menos —no hay interruptor ni gatillos,
// porque los dos sólo significan algo cuando algo dispara solo— y una menos evidente: adoptar las
// sugeridas **no guarda**. Rellena el formulario y deja al dueño decidir.
import { computed, nextTick, ref } from 'vue'
import type { QuickReply } from '@/services/messaging.api'
import {
  MAX_QUICK_REPLIES,
  MAX_QUICK_REPLY_CHARS,
  moveQuickReply,
  quickReplyErrors,
} from '@/lib/quickReplies'

const entries = defineModel<QuickReply[]>('entries', { required: true })

const props = defineProps<{
  /** Las sugeridas del backend, para el tenant que nunca las tocó. */
  suggested: QuickReply[]
  disabled: boolean
}>()

/** Cuál está abierta. Una a la vez: varias tarjetas abiertas no caben en un teléfono. */
const expanded = ref<string | null>(null)
const pendingDelete = ref<string | null>(null)
const confirmAdopt = ref(false)
const moveButtons = ref<Record<string, HTMLButtonElement | null>>({})

const problems = computed(() => quickReplyErrors(entries.value))
const full = computed(() => entries.value.length >= MAX_QUICK_REPLIES)
/** Sólo se ofrece adoptar mientras no haya nada escrito: si no, es un botón que borra trabajo. */
const canAdopt = computed(() => entries.value.length === 0 && props.suggested.length > 0)

function toggleExpanded(id: string): void {
  expanded.value = expanded.value === id ? null : id
}

function over(entry: QuickReply): boolean {
  return entry.text.length > MAX_QUICK_REPLY_CHARS
}

function markersIn(entry: QuickReply): string[] {
  return [...new Set([...entry.text.matchAll(/\{([a-z_]+)\}/g)].map((m) => `{${m[1]}}` as string))]
}

async function move(index: number, delta: -1 | 1): Promise<void> {
  const entry = entries.value[index]
  if (!entry) return
  entries.value = moveQuickReply(entries.value, index, delta)
  // El foco vuelve al MISMO control de la MISMA plantilla, ya en su puesto nuevo: sin esto,
  // subirla al primer puesto deshabilita el botón que la movió y el foco se va al body.
  await nextTick()
  moveButtons.value[`${entry.id}:${delta}`]?.focus()
}

function add(): void {
  if (full.value) return
  // El id lo acuña la pantalla: es configuración dentro de un JSON, no una entidad.
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `quick-${Date.now()}`
  entries.value = [...entries.value, { id, name: '', text: '' }]
  expanded.value = id
}

function remove(id: string): void {
  entries.value = entries.value.filter((e) => e.id !== id)
  pendingDelete.value = null
}

/** Rellena el formulario con las sugeridas. NO guarda: irse sin guardar lo deja como estaba. */
function adopt(): void {
  entries.value = props.suggested.map((entry) => ({ ...entry }))
  confirmAdopt.value = false
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <header class="min-w-0">
      <h2 class="font-display text-lg font-extrabold text-ink">Respuestas rápidas</h2>
      <p class="mt-0.5 text-sm text-steel-500">
        Las frases que tu equipo escribe veinte veces al día, guardadas para insertarlas de un
        toque desde el chat.
      </p>
    </header>

    <!-- La distinción con las FAQs, visible sin abrir nada. Es entregable, no decoración. -->
    <p
      class="mt-3 rounded-lg border border-line bg-app px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-500"
      data-testid="quick-reply-notice"
    >
      Estas <strong>no contestan solas</strong>: las inserta una persona en el chat y esa persona
      pulsa enviar. Si buscas algo que responda por su cuenta, eso son las preguntas frecuentes de
      aquí arriba.
    </p>

    <p class="mt-3 font-mono text-[11px] text-steel-500" data-testid="quick-reply-count">
      <template v-if="entries.length === 0">
        No hay ninguna. El equipo seguirá escribiendo cada frase a mano.
      </template>
      <template v-else>
        <strong class="tabular-nums">{{ entries.length }}</strong>
        de {{ MAX_QUICK_REPLIES }} disponibles. Se ven en el chat en este mismo orden.
      </template>
    </p>

    <!-- Sembrar: sólo con la lista vacía, y sin guardar -->
    <div v-if="canAdopt" class="mt-3">
      <button
        v-if="!confirmAdopt"
        type="button"
        :disabled="disabled"
        data-testid="adopt-suggested"
        class="w-full rounded-lg border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
        @click="confirmAdopt = true"
      >
        Usar las sugeridas
      </button>
      <p
        v-else
        class="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-app px-3 py-2 font-mono text-[11px] text-steel-500"
        data-testid="confirm-adopt"
      >
        Se cargan {{ suggested.length }} para que las edites. No se guardan hasta que pulses
        guardar.
        <button
          type="button"
          class="underline"
          data-testid="confirm-adopt-yes"
          @click="adopt"
        >
          Cargarlas
        </button>
        <button type="button" class="underline" @click="confirmAdopt = false">Cancelar</button>
      </p>
    </div>

    <ul class="mt-3 flex flex-col gap-2">
      <li
        v-for="(entry, index) in entries"
        :key="entry.id"
        class="rounded-lg border border-line bg-app p-3"
        :data-quick-reply="entry.id"
      >
        <div class="flex items-start gap-2">
          <span
            class="mt-0.5 shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-steel-400"
            :data-testid="`quick-reply-position-${entry.id}`"
          >
            {{ index + 1 }}
          </span>

          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            :aria-expanded="expanded === entry.id"
            :data-testid="`quick-reply-header-${entry.id}`"
            @click="toggleExpanded(entry.id)"
          >
            <span class="block truncate text-sm font-medium text-ink">
              {{ entry.name || 'Sin nombre' }}
            </span>
            <span class="mt-0.5 block truncate font-mono text-[10px] text-steel-400">
              {{ entry.text || 'Sin texto' }}
            </span>
          </button>

          <div class="flex shrink-0 items-center gap-1">
            <button
              :ref="(el) => (moveButtons[`${entry.id}:-1`] = el as HTMLButtonElement)"
              type="button"
              :disabled="disabled || index === 0"
              :aria-label="`Subir ${entry.name || 'la respuesta rápida'}`"
              :data-testid="`quick-reply-up-${entry.id}`"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-30"
              @click="move(index, -1)"
            >
              ↑
            </button>
            <button
              :ref="(el) => (moveButtons[`${entry.id}:1`] = el as HTMLButtonElement)"
              type="button"
              :disabled="disabled || index === entries.length - 1"
              :aria-label="`Bajar ${entry.name || 'la respuesta rápida'}`"
              :data-testid="`quick-reply-down-${entry.id}`"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-30"
              @click="move(index, 1)"
            >
              ↓
            </button>
          </div>
        </div>

        <div v-if="expanded === entry.id" class="mt-3 flex flex-col gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
              Nombre
            </span>
            <input
              v-model="entry.name"
              type="text"
              :disabled="disabled"
              placeholder="Va en camino"
              :data-testid="`quick-reply-name-${entry.id}`"
              class="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
            />
            <span class="font-mono text-[10px] text-steel-400">
              Es la etiqueta del botón en el chat. Corta y reconocible de un vistazo.
            </span>
          </label>

          <div class="flex flex-col gap-1">
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
              Qué se inserta
            </span>
            <textarea
              v-model="entry.text"
              rows="3"
              :disabled="disabled"
              :data-testid="`quick-reply-text-${entry.id}`"
              class="rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
            />
            <span
              class="self-end font-mono text-[10px] tabular-nums"
              :class="over(entry) ? 'text-alert' : 'text-steel-400'"
              :data-testid="`quick-reply-chars-${entry.id}`"
            >
              {{ entry.text.length }} / {{ MAX_QUICK_REPLY_CHARS }}
            </span>
            <!-- El marcador no se resuelve en ningún punto del camino: saldría con las llaves -->
            <p
              v-if="markersIn(entry).length"
              role="alert"
              class="font-mono text-[11px] leading-relaxed text-alert"
              :data-testid="`quick-reply-markers-${entry.id}`"
            >
              {{ markersIn(entry).join(', ') }} saldría tal cual en el chat del cliente: las
              respuestas rápidas no rellenan marcadores. Escribe el dato o quítalo.
            </p>
            <span class="font-mono text-[10px] leading-relaxed text-steel-400">
              El texto entra en el chat y ahí se puede editar antes de enviarlo.
            </span>
          </div>

          <div class="flex items-center justify-end gap-2">
            <template v-if="pendingDelete === entry.id">
              <span class="font-mono text-[10px] text-alert">¿Seguro?</span>
              <button
                type="button"
                :data-testid="`quick-reply-delete-confirm-${entry.id}`"
                class="rounded border border-alert/40 px-2 py-1 font-mono text-[10px] text-alert"
                @click="remove(entry.id)"
              >
                Eliminar
              </button>
              <button
                type="button"
                class="font-mono text-[10px] text-steel-400 underline"
                @click="pendingDelete = null"
              >
                Cancelar
              </button>
            </template>
            <button
              v-else
              type="button"
              :disabled="disabled"
              :data-testid="`quick-reply-delete-${entry.id}`"
              class="rounded border border-line px-2 py-1 font-mono text-[10px] text-steel-400 transition hover:border-alert/40 hover:text-alert disabled:opacity-50"
              @click="pendingDelete = entry.id"
            >
              Eliminar
            </button>
          </div>
        </div>
      </li>
    </ul>

    <button
      type="button"
      :disabled="disabled || full"
      data-testid="quick-reply-add"
      class="mt-3 w-full rounded-lg border border-dashed border-line py-2 font-mono text-[11px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
      @click="add"
    >
      {{ full ? `Máximo ${MAX_QUICK_REPLIES}` : '+ Agregar respuesta rápida' }}
    </button>

    <ul
      v-if="problems.length"
      role="alert"
      class="mt-3 flex flex-col gap-0.5 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-[11px] text-alert"
      data-testid="quick-reply-problems"
    >
      <li v-for="problem in problems" :key="problem">· {{ problem }}</li>
    </ul>
  </section>
</template>
