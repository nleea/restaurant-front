<script setup lang="ts">
// La vista previa de un estado. **Es la tarjeta que se va a publicar, no una aproximación.**
//
// Ésa es la única regla del componente y conviene entender por qué es fuerte: color de fondo y
// fuente son *exactamente* los dos parámetros que WhatsApp exige para un estado de texto (devuelve
// 400 sin ellos). Son, por tanto, las dos únicas cosas que la previa podría equivocar — así que una
// previa que los pinte distinto miente sobre lo único que estaba en juego.
//
// De ahí que el fondo venga por `style` y no por una clase: la clase tendría que existir para cada
// color posible, y en el momento en que un color no tuviera clase la tarjeta se pintaría de otro
// color sin fallar. El estilo en línea no puede desincronizarse del valor que se envía.
import { computed } from 'vue'
import { FONTS } from '@/lib/whatsappStatuses'
import type { StatusType } from '@/services/messaging.api'

const props = defineProps<{
  type: StatusType
  content: string
  bgColor: string | null
  font: number | null
  caption: string | null
  mediaUrl: string | null
}>()

/**
 * Las familias con las que se ensaya cada fuente del proveedor.
 *
 * No son las fuentes de WhatsApp —no las tenemos— y eso hay que decirlo: la previa promete la
 * FORMA (serif, estrecha, manuscrita), no el tipo exacto. Prometer el tipo exacto sería la clase de
 * fidelidad que no se puede cumplir, y el dueño lo notaría en el teléfono.
 */
const FONT_STACKS: Record<number, string> = {
  0: 'var(--font-sans, system-ui), sans-serif',
  1: 'Georgia, "Times New Roman", serif',
  2: 'var(--font-display, system-ui), sans-serif',
  3: '"Arial Narrow", "Helvetica Neue", sans-serif',
  4: '"Segoe Script", "Bradley Hand", cursive',
}

const fontStack = computed(() => FONT_STACKS[props.font ?? 0] ?? FONT_STACKS[0])
const fontName = computed(
  () => FONTS.find((f) => f.value === props.font)?.label ?? '—',
)
// El fondo real. Sin color elegido se pinta el grafito del sistema, que es visiblemente "sin
// elegir" en vez de un blanco que parezca una tarjeta válida.
const background = computed(() => props.bgColor ?? 'var(--color-graphite-900)')
</script>

<template>
  <figure class="m-0 flex flex-col gap-2">
    <!-- 9:16, la proporción de una historia. Que la previa tenga la forma del sitio donde va a
         verse es la mitad de lo que hace que se lea como un ensayo y no como un formulario. -->
    <div
      class="relative aspect-[9/16] w-full max-w-[220px] overflow-hidden rounded-xl ring-1 ring-graphite-800/15"
      :style="type === 'text' ? { backgroundColor: background } : undefined"
      data-testid="status-preview-card"
      :data-bg="type === 'text' ? background : undefined"
      :data-font="font ?? ''"
    >
      <template v-if="type === 'text'">
        <p
          class="flex h-full w-full items-center justify-center px-4 text-center text-lg leading-snug text-white"
          :style="{ fontFamily: fontStack }"
        >
          {{ content || 'Escribe el texto del estado…' }}
        </p>
      </template>

      <template v-else>
        <img
          v-if="mediaUrl"
          :src="mediaUrl"
          alt=""
          class="h-full w-full object-cover"
        />
        <div
          v-else
          class="flex h-full w-full items-center justify-center bg-graphite-800 px-4 text-center text-sm text-steel-300"
        >
          Sube una imagen
        </div>
        <p
          v-if="caption"
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-sm text-white"
        >
          {{ caption }}
        </p>
      </template>
    </div>

    <!-- Los dos parámetros, en mono y a la vista. No es decoración: es lo que permite al dueño
         relacionar lo que ve con lo que va a mandarse, y detectar que la previa dice la verdad. -->
    <figcaption
      v-if="type === 'text'"
      class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500"
    >
      {{ bgColor ?? 'sin color' }} · {{ fontName }}
    </figcaption>
  </figure>
</template>
