<script setup lang="ts">
// Las FAQs por palabra clave: lo que el número contesta cuando el cliente PREGUNTA algo.
//
// Es el único mecanismo de esta pantalla que lee el texto del cliente, y por eso la sección
// tiene una obligación que las otras tres no tienen: **decir cuándo NO contesta**. Sin eso, el
// dueño prueba la función escribiéndose a sí mismo con un pedido de prueba abierto, no recibe
// nada, y concluye que está roto. El bloque de silencio no es ayuda contextual decorativa.
//
// El orden de la lista ES la prioridad de coincidencia, así que se puede reordenar — con flechas
// y no arrastrando: no hay librería de drag en el proyecto, el drag no funciona con teclado y en
// móvil (esta app es mobile-first) es una experiencia mala. Dos detalles del reordenar que se
// olvidan siempre: la cifra del puesto hace visible que el orden importa, y hay que devolver el
// foco tras mover o el botón que acabas de pulsar queda deshabilitado y el foco se va al body.
import { computed, nextTick, ref } from 'vue'
import type { FaqEntry } from '@/services/messaging.api'
import { braced, moveFaq, unknownPlaceholders } from '@/lib/whatsappAutoreply'

const faqs = defineModel<FaqEntry[]>('faqs', { required: true })

const props = defineProps<{
  /** Los marcadores válidos en una FAQ, tal y como los declara el backend. */
  placeholders: string[]
  disabled: boolean
}>()

const emit = defineEmits<{ (e: 'restore'): void }>()

/** Cuál está abierta. Una a la vez: cuatro tarjetas abiertas no caben en un teléfono. */
const expanded = ref<string | null>(null)
/** El borrador de gatillo de cada tarjeta, para poder añadirlo con Enter. */
const draftTrigger = ref<Record<string, string>>({})
const pendingDelete = ref<string | null>(null)
const confirmRestore = ref(false)
const moveButtons = ref<Record<string, HTMLButtonElement | null>>({})

const enabledCount = computed(() => faqs.value.filter((f) => f.enabled).length)

function toggleExpanded(id: string): void {
  expanded.value = expanded.value === id ? null : id
}

function toggleEnabled(faq: FaqEntry): void {
  faq.enabled = !faq.enabled
}

function unknownIn(faq: FaqEntry): string[] {
  return unknownPlaceholders(faq.text, props.placeholders)
}

function addTrigger(faq: FaqEntry): void {
  const raw = (draftTrigger.value[faq.id] ?? '').trim()
  if (!raw) return
  // Sin duplicados: dos gatillos iguales no hacen nada y ensucian la tarjeta.
  if (!faq.triggers.includes(raw)) faq.triggers.push(raw)
  draftTrigger.value[faq.id] = ''
}

function removeTrigger(faq: FaqEntry, trigger: string): void {
  faq.triggers = faq.triggers.filter((t) => t !== trigger)
}

async function move(index: number, delta: -1 | 1): Promise<void> {
  const faq = faqs.value[index]
  if (!faq) return
  faqs.value = moveFaq(faqs.value, index, delta)
  // El foco vuelve al MISMO control de la MISMA FAQ, ya en su puesto nuevo. Sin esto, mover una
  // FAQ al primer puesto deshabilita el botón que la movió y el foco se pierde.
  await nextTick()
  moveButtons.value[`${faq.id}:${delta}`]?.focus()
}

function addFaq(): void {
  // El id lo acuña la pantalla: es configuración dentro de un JSON, no una entidad. El backend
  // valida que no se repita.
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `faq-${Date.now()}`
  faqs.value = [
    ...faqs.value,
    { id, name: '', triggers: [], text: '', enabled: true },
  ]
  expanded.value = id
}

function remove(id: string): void {
  faqs.value = faqs.value.filter((f) => f.id !== id)
  pendingDelete.value = null
}

function restore(): void {
  confirmRestore.value = false
  emit('restore')
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="font-display text-lg font-extrabold text-ink">Preguntas frecuentes</h2>
        <p class="mt-0.5 text-sm text-steel-500">
          Cuando el cliente pregunta algo que siempre se contesta igual —dónde están, a qué hora,
          cómo se paga—, el número lo contesta solo. Sin inteligencia artificial: son las palabras
          que tú escribas, ni una más.
        </p>
      </div>
      <button
        type="button"
        :disabled="disabled"
        class="shrink-0 rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
        data-testid="restore-faqs"
        @click="confirmRestore = true"
      >
        Restaurar sugeridas
      </button>
    </header>

    <!-- Restaurar borra lo editado: se pregunta antes -->
    <p
      v-if="confirmRestore"
      role="alert"
      class="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 font-mono text-[11px] text-warn"
      data-testid="confirm-restore"
    >
      Esto reemplaza la lista actual por las cuatro sugeridas y descarta lo que hayas escrito.
      <button type="button" class="underline" data-testid="confirm-restore-yes" @click="restore">
        Reemplazar
      </button>
      <button type="button" class="underline" @click="confirmRestore = false">Cancelar</button>
    </p>

    <!-- Cuándo NO contesta. Es entregable, no decoración: sin esto la función parece rota. -->
    <div
      class="mt-3 rounded-lg border border-line bg-app px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-500"
      data-testid="faq-silence-notice"
    >
      <p class="text-steel-400">Estas respuestas NO salen cuando:</p>
      <ul class="mt-1 flex flex-col gap-0.5">
        <li>· el cliente tiene un pedido en curso — está hablando de lo suyo, no preguntando</li>
        <li>· pide hablar con una persona, o quiere cancelar o que le devuelvan la plata</li>
        <li>· es su primer mensaje: ahí contesta el saludo, que ya lleva el enlace de la carta</li>
        <li>· la conversación ya la atiende alguien del equipo o el asistente</li>
      </ul>
      <p class="mt-1.5 text-steel-400">
        Sí contestan con el negocio cerrado: decir dónde estás o a qué hora abres no promete que
        haya alguien, y son justo las preguntas de la noche.
      </p>
    </div>

    <p class="mt-3 font-mono text-[11px] text-steel-500" data-testid="faq-count">
      <template v-if="faqs.length === 0">
        No hay ninguna. El número no contestará ninguna pregunta por su cuenta.
      </template>
      <template v-else>
        <strong class="tabular-nums">{{ enabledCount }}</strong>
        de {{ faqs.length }} encendidas. Si un mensaje coincide con varias, gana la de arriba.
      </template>
    </p>

    <ul class="mt-3 flex flex-col gap-2">
      <li
        v-for="(faq, index) in faqs"
        :key="faq.id"
        class="rounded-lg border bg-app p-3"
        :class="faq.enabled ? 'border-ember/30' : 'border-line'"
        :data-faq="faq.id"
      >
        <div class="flex items-start gap-2">
          <!-- El puesto: hace visible que el orden ES la prioridad -->
          <span
            class="mt-0.5 shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-steel-400"
            :data-testid="`faq-position-${faq.id}`"
          >
            {{ index + 1 }}
          </span>

          <button
            type="button"
            class="min-w-0 flex-1 text-left"
            :aria-expanded="expanded === faq.id"
            :data-testid="`faq-header-${faq.id}`"
            @click="toggleExpanded(faq.id)"
          >
            <span class="block truncate text-sm font-medium text-ink">
              {{ faq.name || 'Sin nombre' }}
            </span>
            <span class="mt-0.5 block truncate font-mono text-[10px] text-steel-400">
              {{ faq.triggers.length }}
              {{ faq.triggers.length === 1 ? 'palabra clave' : 'palabras clave' }}
            </span>
          </button>

          <div class="flex shrink-0 items-center gap-1">
            <button
              :ref="(el) => (moveButtons[`${faq.id}:-1`] = el as HTMLButtonElement)"
              type="button"
              :disabled="disabled || index === 0"
              :aria-label="`Subir ${faq.name || 'la FAQ'}`"
              :data-testid="`faq-up-${faq.id}`"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-30"
              @click="move(index, -1)"
            >
              ↑
            </button>
            <button
              :ref="(el) => (moveButtons[`${faq.id}:1`] = el as HTMLButtonElement)"
              type="button"
              :disabled="disabled || index === faqs.length - 1"
              :aria-label="`Bajar ${faq.name || 'la FAQ'}`"
              :data-testid="`faq-down-${faq.id}`"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-30"
              @click="move(index, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              role="switch"
              :aria-checked="faq.enabled"
              :aria-label="`Encender ${faq.name || 'la FAQ'}`"
              :disabled="disabled"
              :data-testid="`faq-toggle-${faq.id}`"
              class="relative h-6 w-11 rounded-full transition disabled:opacity-50"
              :class="faq.enabled ? 'bg-success' : 'bg-steel-300'"
              @click="toggleEnabled(faq)"
            >
              <span
                class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
                :class="faq.enabled ? 'left-[22px]' : 'left-0.5'"
              />
            </button>
          </div>
        </div>

        <div v-if="expanded === faq.id" class="mt-3 flex flex-col gap-3">
          <!-- El nombre se edita AQUÍ y no en el header: con las flechas y el toggle no cabe -->
          <label class="flex flex-col gap-1">
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
              Nombre
            </span>
            <input
              v-model="faq.name"
              type="text"
              :disabled="disabled"
              placeholder="Ubicación"
              :data-testid="`faq-name-${faq.id}`"
              class="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
            />
            <span class="font-mono text-[10px] text-steel-400">
              Sólo lo ves tú, para reconocerla en esta lista.
            </span>
          </label>

          <div class="flex flex-col gap-1">
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
              Palabras o frases que la disparan
            </span>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="trigger in faq.triggers"
                :key="trigger"
                class="flex items-center gap-1 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink"
              >
                {{ trigger }}
                <button
                  type="button"
                  :disabled="disabled"
                  :aria-label="`Quitar ${trigger}`"
                  :data-testid="`faq-trigger-remove-${faq.id}-${trigger}`"
                  class="text-steel-400 transition hover:text-alert"
                  @click="removeTrigger(faq, trigger)"
                >
                  ×
                </button>
              </span>
            </div>
            <input
              v-model="draftTrigger[faq.id]"
              type="text"
              :disabled="disabled"
              placeholder="donde estan · y Enter"
              :data-testid="`faq-trigger-input-${faq.id}`"
              class="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
              @keydown.enter.prevent="addTrigger(faq)"
            />
            <span class="font-mono text-[10px] leading-relaxed text-steel-400">
              Se busca la palabra o la frase COMPLETA, así que "pago" no se activa con "ya pagué".
              No importan las mayúsculas, las tildes ni el singular o el plural.
            </span>
          </div>

          <div class="flex flex-col gap-1">
            <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
              Qué se contesta
            </span>
            <textarea
              v-model="faq.text"
              rows="3"
              :disabled="disabled"
              :data-testid="`faq-text-${faq.id}`"
              class="rounded-lg border border-line bg-paper px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
            />
            <div class="flex flex-wrap gap-1">
              <span
                v-for="p in placeholders"
                :key="`${faq.id}-${p}`"
                class="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel-400"
              >
                {{ braced(p) }}
              </span>
            </div>
            <p
              v-if="unknownIn(faq).length"
              role="alert"
              class="font-mono text-[11px] text-alert"
              :data-testid="`faq-unknown-${faq.id}`"
            >
              No existe {{ unknownIn(faq).map(braced).join(', ') }} en una FAQ.
            </p>
            <span class="font-mono text-[10px] leading-relaxed text-steel-400">
              Sale tal cual: el sistema no le añade ni una línea.
              {{ braced('hours_line') }} se resuelve solo — "hoy hasta las 22:00" con el negocio
              abierto, "cerrados; abrimos mañana a las 8:00" cuando no.
            </span>
          </div>

          <div class="flex items-center justify-end gap-2">
            <template v-if="pendingDelete === faq.id">
              <span class="font-mono text-[10px] text-alert">¿Seguro?</span>
              <button
                type="button"
                :data-testid="`faq-delete-confirm-${faq.id}`"
                class="rounded border border-alert/40 px-2 py-1 font-mono text-[10px] text-alert"
                @click="remove(faq.id)"
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
              :data-testid="`faq-delete-${faq.id}`"
              class="rounded border border-line px-2 py-1 font-mono text-[10px] text-steel-400 transition hover:border-alert/40 hover:text-alert disabled:opacity-50"
              @click="pendingDelete = faq.id"
            >
              Eliminar
            </button>
          </div>
        </div>
      </li>
    </ul>

    <button
      type="button"
      :disabled="disabled"
      data-testid="faq-add"
      class="mt-3 w-full rounded-lg border border-dashed border-line py-2 font-mono text-[11px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
      @click="addFaq"
    >
      + Agregar pregunta
    </button>
  </section>
</template>
