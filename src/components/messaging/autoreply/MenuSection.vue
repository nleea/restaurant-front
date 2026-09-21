<script setup lang="ts">
// El menú de opciones: la respuesta que evita el silencio.
//
// Es el último automatismo de la cadena —saludo → asistente → FAQs → opciones— y sólo sale
// cuando los anteriores no contestaron. Antes de esto, un mensaje no entendido en un chat
// abierto se quedaba mudo, y al cliente eso le parece que lo ignoran.
//
// Dos cosas que la sección tiene que dejar claras aunque el dueño no lea nada más: cuándo sale
// (una vez por conversación, con el negocio abierto) y qué entiende (las palabras y los números
// que el backend reconoce). Sin lo segundo, escribirá un menú de opciones que no se corresponden
// con nada de lo que el sistema sabe resolver.
import { computed, ref } from 'vue'
import {
  braced,
  bracedList,
  previewMenu,
  unknownPlaceholders,
  DEFAULT_OPTIONS_MENU,
  type BusinessIdentity,
} from '@/lib/whatsappAutoreply'

const enabled = defineModel<boolean>('enabled', { required: true })
const text = defineModel<string>('text', { required: true })

const props = defineProps<{
  /** Los marcadores válidos del menú, tal y como los declara el backend. */
  placeholders: string[]
  /** El texto de fábrica del backend, para el campo vacío y la vista previa. */
  defaultText: string
  /** Cómo se llama el negocio y su sede, según el Perfil. No es relleno. */
  identity: BusinessIdentity
  /** El enlace que le tocaría a la sede. */
  previewLink: string
  disabled: boolean
}>()

// El texto vacío hereda el de fábrica: el backend hace exactamente eso al enviar, y una vista
// previa en blanco haría creer que el menú sale vacío.
const effectiveText = computed(() => text.value || props.defaultText || DEFAULT_OPTIONS_MENU)

const preview = computed(() =>
  previewMenu({
    ...props.identity,
    template: effectiveText.value,
    menuLink: props.previewLink,
  }),
)

// Se avisa mientras se escribe, pero quien manda es el 422 del backend al guardar.
const unknown = computed(() => unknownPlaceholders(text.value, props.placeholders))

// Insertar el marcador donde está el cursor, no al final.
const textRef = ref<HTMLTextAreaElement | null>(null)

function insert(placeholder: string): void {
  const token = `{${placeholder}}`
  const current = text.value || effectiveText.value
  const at = textRef.value?.selectionStart ?? current.length
  text.value = current.slice(0, at) + token + current.slice(textRef.value?.selectionEnd ?? at)
  void Promise.resolve().then(() => {
    textRef.value?.focus()
    textRef.value?.setSelectionRange(at + token.length, at + token.length)
  })
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4 sm:p-5">
    <header class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="font-display text-lg font-extrabold text-ink">Menú de opciones</h2>
        <p class="mt-0.5 text-sm text-steel-500">
          La respuesta que sale cuando el cliente escribe algo que el saludo, el asistente y las
          preguntas frecuentes no contestan. Sin esto, ese mensaje se queda sin respuesta.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        :aria-checked="enabled"
        aria-label="Menú de opciones"
        :disabled="disabled"
        data-testid="menu-toggle"
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
      data-testid="menu-off-notice"
    >
      Con el menú apagado, un mensaje que no coincide con el saludo ni con ninguna pregunta
      frecuente se queda sin respuesta, y el cliente lo lee como que lo ignoran.
    </p>

    <div class="mt-4 grid gap-5 lg:grid-cols-2">
      <!-- Editor -->
      <div class="flex flex-col gap-1.5">
        <label
          for="menu-text"
          class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500"
        >
          Qué contesta
        </label>
        <textarea
          id="menu-text"
          ref="textRef"
          v-model="text"
          rows="5"
          :disabled="disabled"
          :placeholder="defaultText || DEFAULT_OPTIONS_MENU"
          data-testid="menu-text"
          class="rounded-lg border border-line bg-app px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
        />
        <div class="flex flex-wrap gap-1">
          <button
            v-for="p in placeholders"
            :key="`menu-${p}`"
            type="button"
            :disabled="disabled"
            class="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel-500 transition hover:border-ember/50 hover:text-ember-600 disabled:opacity-50"
            @click="insert(p)"
          >
            {{ braced(p) }}
          </button>
        </div>
        <p
          v-if="unknown.length"
          role="alert"
          class="font-mono text-[11px] text-alert"
          data-testid="menu-unknown"
        >
          No existe {{ bracedList(unknown) }}. Saldría tal cual, con el hueco a la vista.
        </p>

        <!-- Lo que el sistema reconoce. Es entregable: sin esto, el dueño escribe un menú que
             no se corresponde con nada de lo que el backend sabe resolver. -->
        <p
          class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-500"
          data-testid="menu-options-notice"
        >
          El cliente responde con un número. <strong>1</strong> manda el enlace a la carta,
          <strong>2</strong> cuenta cómo va su último pedido y <strong>3</strong> avisa al equipo.
          También se entienden las palabras <strong>pedido</strong>, <strong>estado</strong> y
          <strong>persona</strong>. Los números sólo cuentan cuando el mensaje es el número suelto:
          "quiero 2 hamburguesas" no es una consulta de estado.
        </p>
        <p class="font-mono text-[10px] leading-relaxed text-steel-400">
          Sale una vez por conversación, sólo en un chat abierto y con el negocio abierto. Si el
          mismo cliente vuelve a escribir algo que no se entiende, la conversación queda para que
          la atienda una persona.
        </p>
      </div>

      <!-- Vista previa -->
      <div class="flex flex-col gap-2">
        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
          Así se ve
        </p>
        <div class="rounded-lg bg-app p-3">
          <p
            class="whitespace-pre-wrap break-words rounded-lg rounded-tl-none bg-paper px-3 py-2 text-sm leading-relaxed text-ink shadow-sm"
            data-testid="menu-preview"
          >
            {{ preview }}
          </p>
        </div>
        <p
          v-if="!text"
          class="font-mono text-[10px] leading-relaxed text-steel-400"
          data-testid="menu-default-note"
        >
          Sin texto propio sale el de fábrica. Escríbelo para cambiarlo.
        </p>
      </div>
    </div>
  </section>
</template>
