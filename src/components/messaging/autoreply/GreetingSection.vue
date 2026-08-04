<script setup lang="ts">
// El saludo: la primera respuesta que recibe alguien que escribe al número de la sucursal.
//
// Un texto, N sucursales. Los marcadores son lo que lo hace posible — `{branch_name}` y
// `{menu_link}` se resuelven contra la sede que recibió el mensaje, así que la vista previa
// se pinta POR SUCURSAL: es la única forma de ver que un mismo texto manda el enlace correcto
// a cada cocina. Y se pinta en sus DOS formas (abierto y cerrado) porque la variante de
// cerrado es la que nadie prueba y la que más se rompe: es la que usa `{next_opening}`.
import { computed, ref } from 'vue'
import {
  braced,
  bracedList,
  previewGreeting,
  unknownPlaceholders,
  DEFAULT_GREETING_OPEN,
  DEFAULT_GREETING_CLOSED,
  type BusinessIdentity,
} from '@/lib/whatsappAutoreply'

const enabled = defineModel<boolean>('enabled', { required: true })
const openText = defineModel<string>('openText', { required: true })
const closedText = defineModel<string>('closedText', { required: true })
const awaitingText = defineModel<string>('awaitingText', { required: true })

const props = defineProps<{
  /** Los marcadores válidos en el saludo, tal y como los declara el backend. */
  placeholders: string[]
  branches: { id: string; name: string; code: string }[]
  /** Sucursal elegida para la vista previa. */
  previewBranchId: string | null
  /** Cómo se llama el negocio, según el Perfil del negocio. No es texto de relleno. */
  identity: BusinessIdentity
  /** El enlace que le tocaría a esa sede. */
  previewLink: string
  /** "mañana a las 8:00" para esa sede; null cuando no tiene horarios cargados. */
  previewNextOpening: string | null
  /** Los marcadores válidos SÓLO en la variante de "esperando pago" (lleva los del pedido). */
  awaitingPlaceholders: string[]
  assistantOffer: boolean
  disabled: boolean
}>()

const emit = defineEmits<{ (e: 'update:previewBranchId', value: string): void }>()

// Los textos vacíos heredan el de fábrica: el backend hace exactamente eso al enviar, y una
// vista previa en blanco haría creer que el saludo sale vacío.
const effectiveOpen = computed(() => openText.value || DEFAULT_GREETING_OPEN)
const effectiveClosed = computed(() => closedText.value || DEFAULT_GREETING_CLOSED)

const openPreview = computed(() =>
  previewGreeting({
    ...props.identity,
    template: effectiveOpen.value,
    menuLink: props.previewLink,
    assistantOffer: props.assistantOffer,
  }),
)
// La variante de cerrado NUNCA lleva la oferta del asistente, aunque el interruptor esté
// encendido: fuera de horario el asistente está apagado, así que el backend no la añade
// (`autoreply.py`, `ASSISTANT_OFFER`). Pintarla aquí enseñaría un saludo que no existe.
const closedPreview = computed(() =>
  previewGreeting({
    ...props.identity,
    template: effectiveClosed.value,
    menuLink: props.previewLink,
    nextOpeningLabel: props.previewNextOpening ?? undefined,
    assistantOffer: false,
  }),
)

// Se avisa mientras se escribe, pero quien manda es el 422 del backend al guardar.
const openUnknown = computed(() => unknownPlaceholders(openText.value, props.placeholders))
const closedUnknown = computed(() => unknownPlaceholders(closedText.value, props.placeholders))
const awaitingUnknown = computed(() =>
  unknownPlaceholders(awaitingText.value, props.awaitingPlaceholders),
)

// Insertar el marcador donde está el cursor, no al final: el sitio natural de `{menu_link}`
// es en mitad de una frase ya escrita.
const openRef = ref<HTMLTextAreaElement | null>(null)
const closedRef = ref<HTMLTextAreaElement | null>(null)
const awaitingRef = ref<HTMLTextAreaElement | null>(null)

function insert(which: 'open' | 'closed' | 'awaiting', placeholder: string): void {
  const el =
    which === 'open' ? openRef.value : which === 'closed' ? closedRef.value : awaitingRef.value
  const model = which === 'open' ? openText : which === 'closed' ? closedText : awaitingText
  const token = `{${placeholder}}`
  const fallback =
    which === 'open' ? DEFAULT_GREETING_OPEN : which === 'closed' ? DEFAULT_GREETING_CLOSED : ''
  const current = model.value || fallback
  const at = el?.selectionStart ?? current.length
  model.value = current.slice(0, at) + token + current.slice(el?.selectionEnd ?? at)
  void Promise.resolve().then(() => {
    el?.focus()
    el?.setSelectionRange(at + token.length, at + token.length)
  })
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="font-display text-lg font-extrabold text-ink">El saludo</h2>
        <p class="mt-0.5 text-sm text-steel-500">
          Sale una sola vez, en cuanto alguien escribe por primera vez. No lee lo que dijo:
          "quiero pedir", "buenas" y "?" merecen la misma primera respuesta.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="enabled"
        :aria-label="'Saludo automático'"
        :disabled="disabled"
        data-testid="greeting-toggle"
        class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
        :class="enabled ? 'bg-success' : 'bg-steel-300'"
        @click="enabled = !enabled"
      >
        <span
          class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
          :class="enabled ? 'left-[22px]' : 'left-0.5'"
        />
      </button>
    </header>

    <p
      v-if="!enabled"
      class="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-warn"
      data-testid="greeting-off-notice"
    >
      Con el saludo apagado, quien escriba no recibe nada: la conversación entra al inbox y
      espera a que una persona la conteste.
    </p>

    <div class="mt-4 grid gap-5 lg:grid-cols-2">
      <!-- Editores -->
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <label
            for="greeting-open"
            class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500"
          >
            Cuando está abierto
          </label>
          <textarea
            id="greeting-open"
            ref="openRef"
            v-model="openText"
            rows="5"
            :disabled="disabled"
            :placeholder="DEFAULT_GREETING_OPEN"
            data-testid="greeting-open"
            class="rounded-lg border border-line bg-app px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
          />
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in placeholders"
              :key="`open-${p}`"
              type="button"
              :disabled="disabled"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
              @click="insert('open', p)"
            >
              {{ braced(p) }}
            </button>
          </div>
          <p
            v-if="openUnknown.length"
            role="alert"
            class="font-mono text-[11px] text-alert"
            data-testid="greeting-open-unknown"
          >
            No existe {{ bracedList(openUnknown) }}. Saldría tal cual, con
            el hueco a la vista.
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label
            for="greeting-closed"
            class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500"
          >
            Cuando está cerrado
          </label>
          <textarea
            id="greeting-closed"
            ref="closedRef"
            v-model="closedText"
            rows="5"
            :disabled="disabled"
            :placeholder="DEFAULT_GREETING_CLOSED"
            data-testid="greeting-closed"
            class="rounded-lg border border-line bg-app px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
          />
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in placeholders"
              :key="`closed-${p}`"
              type="button"
              :disabled="disabled"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
              @click="insert('closed', p)"
            >
              {{ braced(p) }}
            </button>
          </div>
          <p
            v-if="closedUnknown.length"
            role="alert"
            class="font-mono text-[11px] text-alert"
            data-testid="greeting-closed-unknown"
          >
            No existe {{ bracedList(closedUnknown) }}. Saldría tal cual, con
            el hueco a la vista.
          </p>
        </div>

        <!-- Tercera variante. Se elige por el ESTADO DEL PEDIDO, no por lo que el cliente
             escriba: el saludo sigue sin leer el texto. Vacía = sale la de abierto/cerrado. -->
        <div class="flex flex-col gap-1.5">
          <label
            for="greeting-awaiting"
            class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500"
          >
            Cuando tiene un pedido esperando pago
          </label>
          <textarea
            id="greeting-awaiting"
            v-model="awaitingText"
            rows="4"
            :disabled="disabled"
            placeholder="Déjalo vacío para usar el saludo normal"
            data-testid="greeting-awaiting"
            class="rounded-lg border border-line bg-app px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
          />
          <div class="flex flex-wrap gap-1">
            <button
              v-for="p in awaitingPlaceholders"
              :key="`awaiting-${p}`"
              type="button"
              :disabled="disabled"
              class="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
              @click="insert('awaiting', p)"
            >
              {{ braced(p) }}
            </button>
          </div>
          <p
            v-if="awaitingUnknown.length"
            role="alert"
            class="font-mono text-[11px] text-alert"
            data-testid="greeting-awaiting-unknown"
          >
            No existe {{ bracedList(awaitingUnknown) }} en este saludo.
          </p>
          <p class="font-mono text-[10px] leading-relaxed text-steel-400">
            Sale cuando quien escribe tiene un pedido prepago sin pagar — da igual lo que escriba.
            Sin este texto sale el saludo normal, así que alguien que manda su comprobante recibiría
            "mira nuestra carta" encima.
          </p>
        </div>
      </div>

      <!-- Vista previa: el mismo texto, resuelto para una sede concreta -->
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
            Así se ve
          </p>
          <select
            v-if="branches.length > 1"
            :value="previewBranchId ?? ''"
            aria-label="Sucursal de la vista previa"
            data-testid="preview-branch"
            class="rounded-lg border border-line bg-app px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-ember/60"
            @change="emit('update:previewBranchId', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-3 rounded-lg bg-app p-3">
          <div>
            <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-success">
              Abierto
            </p>
            <p
              class="whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-paper px-3 py-2 text-sm leading-relaxed text-ink shadow-sm"
              data-testid="preview-open"
            >
              {{ openPreview }}
            </p>
          </div>
          <div>
            <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-steel-400">
              Cerrado
            </p>
            <p
              class="whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-paper px-3 py-2 text-sm leading-relaxed text-ink shadow-sm"
              data-testid="preview-closed"
            >
              {{ closedPreview }}
            </p>
            <p
              v-if="assistantOffer"
              class="mt-1 font-mono text-[10px] leading-relaxed text-steel-400"
              data-testid="preview-closed-no-offer"
            >
              Fuera de horario no se ofrece el asistente: cerrado tampoco contesta él, y un
              cliente escribiendo "1" a esa hora no recibiría nada.
            </p>
            <p
              v-if="!previewNextOpening"
              class="mt-1 font-mono text-[10px] leading-relaxed text-warn"
              data-testid="preview-no-hours"
            >
              Esta sede no tiene horarios cargados, así que `{next_opening}` sale sin resolver.
              Cárgalos en Negocio › Horarios.
            </p>
          </div>
        </div>

        <p class="font-mono text-[10px] leading-relaxed text-steel-400">
          El enlace lleva un token por conversación que precarga el nombre y el teléfono del
          cliente en el checkout. Aquí va abreviado.
        </p>
      </div>
    </div>
  </section>
</template>
