<script setup lang="ts">
// La cola. El orden es el punto: quien lleva más esperando va arriba, porque un WhatsApp sin
// contestar es lo único de esta pantalla con un coste pegado.
//
// De ahí sale la firma de la vista: **el tiempo de espera se ve antes de leer nada**. Cada fila
// lleva un filo de calor a la izquierda cuya intensidad crece con el rato que el cliente lleva
// esperando; a los 60 minutos está al máximo. Se lee cruzando el mostrador. Y por eso se quitó la
// etiqueta "· ESPERANDO RESPUESTA" que había antes: el filo lo dice mejor y sin ocupar una línea.
//
// Las filas NO son tarjetas con borde. Una cola es un carril continuo, y rodear cada elemento de
// su propia caja convierte una lista de personas esperando en un formulario. Separadores de
// hairline, y el único acento vertical es el calor.
import { computed, ref } from 'vue'
import type { Conversation } from '@/services/messaging.api'
import {
  contactInitials,
  contactLabel,
  waitingHeat,
  waitingLabel,
} from '@/lib/whatsappContact'

const props = defineProps<{
  conversations: Conversation[]
  selectedId: string | null
  loading: boolean
  /** El empleado que está mirando, para poder separar "mías" de "de otros". */
  currentEmployeeId?: string | null
}>()

const emit = defineEmits<{ select: [conversation: Conversation] }>()

type Filter = 'unclaimed' | 'mine' | 'closed' | 'all'

const search = ref('')
const filter = ref<Filter>('all')

const matchesSearch = (c: Conversation): boolean => {
  const q = search.value.trim().toLowerCase()
  if (!q) return true
  return (
    (c.contact_name ?? '').toLowerCase().includes(q) ||
    c.contact_phone.toLowerCase().includes(q)
  )
}

const inFilter = (c: Conversation, f: Filter): boolean => {
  if (f === 'all') return true
  if (f === 'closed') return c.status === 'closed'
  if (f === 'unclaimed') return c.status !== 'closed' && !c.employee_id
  // El `Boolean(mine)` no sobra: sin empleado vinculado, `null === null` haría que TODA
  // conversación sin tomar apareciera como "mías".
  const mine = props.currentEmployeeId
  return Boolean(mine) && c.status !== 'closed' && c.employee_id === mine
}

/** Los contadores cuentan sobre la BÚSQUEDA, no sobre todo: si no, mienten mientras filtras. */
const counts = computed(() => {
  const visible = props.conversations.filter(matchesSearch)
  return {
    unclaimed: visible.filter((c) => inFilter(c, 'unclaimed')).length,
    mine: visible.filter((c) => inFilter(c, 'mine')).length,
    closed: visible.filter((c) => inFilter(c, 'closed')).length,
    all: visible.length,
  }
})

const TABS: { key: Filter; label: string }[] = [
  { key: 'unclaimed', label: 'Sin tomar' },
  { key: 'mine', label: 'Mías' },
  { key: 'closed', label: 'Cerradas' },
  { key: 'all', label: 'Todas' },
]

const ordered = computed(() =>
  props.conversations
    .filter((c) => matchesSearch(c) && inFilter(c, filter.value))
    .sort((a, b) => {
      if (a.awaiting_reply !== b.awaiting_reply) return a.awaiting_reply ? -1 : 1
      return (b.last_message_at ?? b.started_at).localeCompare(
        a.last_message_at ?? a.started_at,
      )
    }),
)

/** "14:05" hoy, "12 jul" antes — la resolución que un agente necesita de verdad. */
function when(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  const today = new Date()
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return sameDay
    ? date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** El filo. `opacity` en vez de un color por tramo: el calor es continuo, no tiene escalones. */
function heatStyle(c: Conversation): Record<string, string> {
  const heat = waitingHeat(c.awaiting_reply, c.last_message_at)
  return { opacity: heat === 0 ? '0' : String(0.25 + heat * 0.75) }
}

const emptyCopy = computed(() => {
  if (search.value.trim()) return `Nadie coincide con "${search.value.trim()}".`
  if (filter.value === 'unclaimed') return 'No hay conversaciones sin tomar. Todo atendido.'
  if (filter.value === 'mine') return 'No tienes ninguna conversación tomada.'
  if (filter.value === 'closed') return 'Todavía no se ha cerrado ninguna.'
  return 'Nadie ha escrito a esta sucursal todavía.'
})
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <!-- Buscar. Sin caja hasta que se usa: la cola es lo que importa, no el buscador. -->
    <div class="relative shrink-0">
      <i
        class="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-steel-400"
      />
      <input
        v-model="search"
        type="search"
        placeholder="Buscar nombre o número"
        aria-label="Buscar conversaciones"
        data-testid="conversation-search"
        class="w-full rounded-lg border border-transparent bg-sunken py-2 pl-8 pr-3 text-[13px] text-ink outline-none transition placeholder:text-steel-400 focus:border-ember/50 focus:bg-paper"
      />
    </div>

    <!-- Filtros. Subrayado y no pastilla: la pantalla ya habla en mono-uppercase y una pastilla
         rellena aquí sería vocabulario de otro sitio. Alto de toque de 44px pese al texto de 10px. -->
    <div
      role="tablist"
      aria-label="Filtrar conversaciones"
      class="mt-2 flex shrink-0 items-stretch gap-3 border-b border-line"
    >
      <button
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="filter === tab.key"
        :data-filter="tab.key"
        class="-mb-px flex items-center gap-1.5 border-b-2 px-0.5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] transition"
        :class="
          filter === tab.key
            ? 'border-ember text-ember-600'
            : 'border-transparent text-steel-400 hover:text-steel-600'
        "
        @click="filter = tab.key"
      >
        {{ tab.label }}
        <span class="tabular-nums" :class="filter === tab.key ? '' : 'text-steel-300'">
          {{ counts[tab.key] }}
        </span>
      </button>
    </div>

    <p v-if="loading" class="mt-4 font-mono text-[11px] text-steel-500">
      Cargando conversaciones…
    </p>

    <p
      v-else-if="!ordered.length"
      class="mt-4 px-1 text-[13px] leading-relaxed text-steel-500"
      data-testid="list-empty"
    >
      {{ emptyCopy }}
    </p>

    <ul v-else class="mt-1 min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
      <li v-for="c in ordered" :key="c.id">
        <button
          type="button"
          class="relative flex w-full items-start gap-3 py-3 pl-4 pr-2 text-left transition hover:bg-sunken/60"
          :class="selectedId === c.id ? 'bg-sunken' : ''"
          :data-conversation="c.id"
          @click="emit('select', c)"
        >
          <!-- El filo de calor. Único acento vertical de la fila. -->
          <span
            class="absolute inset-y-2 left-0 w-[3px] rounded-full bg-ember transition-opacity"
            :style="heatStyle(c)"
            :data-heat="c.id"
            aria-hidden="true"
          />

          <!-- El disco es IDENTIDAD, no estado. Teñirlo de ember cuando alguien espera dejaba
               al ember diciendo lo mismo tres veces —filo, hora y disco— y llenaba la columna de
               manchas donde el filo ya daba un ritmo vertical limpio. -->
          <span
            class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[11px] font-bold text-steel-500"
            aria-hidden="true"
          >
            {{ contactInitials(c.contact_name, c.contact_phone) }}
          </span>

          <span class="min-w-0 flex-1">
            <span class="flex items-baseline justify-between gap-2">
              <span
                class="truncate text-[14px] text-ink"
                :class="c.awaiting_reply ? 'font-semibold' : 'font-medium'"
              >
                {{ contactLabel(c.contact_name, c.contact_phone) }}
              </span>
              <span
                class="shrink-0 font-mono text-[10px] tabular-nums"
                :class="c.awaiting_reply ? 'text-ember-600' : 'text-steel-400'"
              >
                {{ when(c.last_message_at) }}
              </span>
            </span>

            <span class="mt-0.5 block truncate text-[13px] text-steel-500">
              {{ c.last_message_preview ?? 'Sin mensajes' }}
            </span>

            <!-- UNA línea de estado. Antes eran tres etiquetas compitiendo. -->
            <span class="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide">
              <span v-if="c.awaiting_reply" class="text-ember-600" :data-waiting="c.id">
                {{ waitingLabel(c.awaiting_reply, c.last_message_at) }}
              </span>
              <span v-else-if="c.holder_name" class="text-steel-400">
                {{ c.holder_name }}
              </span>
              <span v-else-if="c.status === 'closed'" class="text-steel-300">Cerrada</span>
              <span v-else class="text-steel-400">Sin tomar</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
