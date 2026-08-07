<script setup lang="ts">
// Quién prepara este plato. Vive en la carta y no en una configuración de cocina aparte porque
// el momento en que hace falta es al crear el plato, y ahí es donde está la persona. Mandarla a
// otra sección a completarlo es exactamente el paso que no ocurre — y así un plato acaba
// vendiéndose, cobrándose y siendo invisible para la cocina.
//
// Las acciones ya existían en el store (`attachProduct`, `detachProduct`, `updateMapping`) sin
// que ninguna pantalla las llamara. Esto es la pantalla.
import { computed, ref, watch } from 'vue'
import { useKitchenStore } from '@/stores/kitchen'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import type { StationSuggestion, StationTask } from '@/services/kitchen.api'

const props = defineProps<{ productId: string }>()

const kitchen = useKitchenStore()
const auth = useAuthStore()
const branch = useBranchStore()
// El permiso lo resuelve el panel, no quien lo pinta: mapear un plato a una estación es
// configurar la COCINA (`kitchen.update`), no editar la carta (`menu.manage`). Alguien puede
// tener una cosa y no la otra, y heredar el permiso equivocado abre una puerta que no toca.
const canManage = computed(() => auth.can('kitchen.update'))

const mappings = computed(() => kitchen.stationsByProduct[props.productId] ?? [])
const stationName = (id: string) =>
  kitchen.stations.find((s) => s.id === id)?.name ?? 'Estación'

/** Las que todavía no están asignadas: mapear dos veces la misma da conflicto en el servidor. */
const available = computed(() =>
  kitchen.stations.filter((s) => !mappings.value.some((m) => m.kitchen_station_id === s.id)),
)

const busy = ref(false)
const error = ref<string | null>(null)
const picking = ref('')

watch(
  () => props.productId,
  (id) => {
    if (id) void kitchen.loadProductStations(id).catch(() => {})
  },
  { immediate: true },
)

async function run(action: () => Promise<void>, failure: string) {
  busy.value = true
  error.value = null
  try {
    await action()
  } catch {
    error.value = failure
  } finally {
    busy.value = false
  }
}

const attach = () => {
  const stationId = picking.value
  if (!stationId) return
  picking.value = ''
  return run(
    () => kitchen.attachProduct(props.productId, stationId),
    'No se pudo asignar la estación.',
  )
}
const detach = (stationId: string) =>
  run(
    () => kitchen.detachProduct(props.productId, stationId),
    'No se pudo quitar la estación.',
  )
const setRole = (mappingId: string, role: string) =>
  run(
    () => kitchen.updateMapping(props.productId, mappingId, { role: role.trim() || null }),
    'No se pudo guardar el rol.',
  )

// Las tareas se editan por FILAS y no como una cadena separada por comas: reescribir la etiqueta
// de una tarea derivada no puede desconectarla de su insumo, y ese vínculo es justo lo que
// permite que la chit de la doble diga 300 g y la de la sencilla 150 g.
const MAX_TASKS = 10

/** Renombrar en su sitio, conservando el insumo. */
const renameTask = (m: { id: string; tasks: StationTask[] }, index: number, label: string) => {
  const trimmed = label.trim()
  const task = m.tasks[index]
  if (!task || !trimmed || trimmed === task.label) return
  const next = m.tasks.map((t, i) => (i === index ? { ...t, label: trimmed } : t))
  return run(
    () => kitchen.updateMapping(props.productId, m.id, { tasks: next }),
    'No se pudieron guardar las tareas.',
  )
}

const removeTask = (m: { id: string; tasks: StationTask[] }, index: number) =>
  run(
    () =>
      kitchen.updateMapping(props.productId, m.id, {
        tasks: m.tasks.filter((_t, i) => i !== index),
      }),
    'No se pudo quitar la tarea.',
  )

/** Un paso que ninguna receta puede saber ("Emplatar"): nace sin insumo. */
const newTask = ref<Record<string, string>>({})
const addTask = (m: { id: string; tasks: StationTask[] }) => {
  const label = (newTask.value[m.id] ?? '').trim()
  if (!label || m.tasks.length >= MAX_TASKS) return
  newTask.value[m.id] = ''
  return run(
    () =>
      kitchen.updateMapping(props.productId, m.id, {
        tasks: [...m.tasks, { label, ingredient_id: null }],
      }),
    'No se pudo agregar la tarea.',
  )
}

// --- Derivar de la receta ----------------------------------------------------
// El plato ya sabe de qué está hecho y cada insumo sabe en qué estación se trabaja: juntarlo
// responde solo la pregunta que deja tildado a cualquiera aquí — «¿y qué le pongo a cada
// estación?». PROPONE: se guarda cuando la persona confirma, nunca antes, porque derivar en
// vivo reescribiría comandas que ya están en el pase.
interface DraftTask {
  label: string
  ingredient_id: string | null
  /** Sólo para mostrar lo que va a producir; la cantidad NO se guarda en la etiqueta. */
  amounts: string[]
}

interface StationDraft {
  stationId: string
  stationName: string
  selected: boolean
  /** Editable antes de guardar, conservando el insumo de cada fila. */
  tasks: DraftTask[]
}

const suggestion = ref<StationSuggestion | null>(null)
const draft = ref<StationDraft[]>([])
const suggesting = ref(false)
const confirming = ref(false)

const nothingToDerive = computed(
  () =>
    suggestion.value !== null &&
    suggestion.value.stations.length === 0 &&
    suggestion.value.unassigned_ingredients.length === 0,
)

/** La deriva sólo existe contra un mapeo YA guardado: sin fila no hay nada que reconciliar. */
const driftByStation = computed(() => {
  const map = new Map<string, { missing: string[]; stale: string[] }>()
  for (const s of suggestion.value?.stations ?? []) {
    if (s.missing_from_saved.length || s.saved_no_longer_implied.length) {
      map.set(s.station_id, { missing: s.missing_from_saved, stale: s.saved_no_longer_implied })
    }
  }
  return map
})

async function derive() {
  if (!branch.activeBranchId) return
  suggesting.value = true
  error.value = null
  try {
    const result = await kitchen.fetchStationSuggestion(props.productId, branch.activeBranchId)
    suggestion.value = result
    draft.value = result.stations.map((s) => ({
      stationId: s.station_id,
      stationName: s.station_name,
      selected: true,
      tasks: s.tasks.map((t) => ({
        label: t.label,
        ingredient_id: t.ingredient_id,
        amounts: t.amounts,
      })),
    }))
  } catch {
    error.value = 'No se pudo derivar de la receta.'
  } finally {
    suggesting.value = false
  }
}

function discardDraft() {
  suggestion.value = null
  draft.value = []
}

/** Guardar recién aquí, por las mismas rutas de asignación que el panel ya usaba. */
async function confirmDraft() {
  confirming.value = true
  error.value = null
  try {
    for (const row of draft.value.filter((d) => d.selected)) {
      const tasks: StationTask[] = row.tasks
        .filter((t) => t.label.trim())
        .slice(0, MAX_TASKS)
        .map((t) => ({ label: t.label.trim(), ingredient_id: t.ingredient_id }))
      const existing = mappings.value.find((m) => m.kitchen_station_id === row.stationId)
      if (existing) {
        await kitchen.updateMapping(props.productId, existing.id, { tasks })
      } else {
        await kitchen.attachProduct(props.productId, row.stationId, null, tasks)
      }
    }
    discardDraft()
  } catch {
    error.value = 'No se pudo guardar la asignación derivada.'
  } finally {
    confirming.value = false
  }
}

// Un borrador pertenece al plato que lo originó: cambiar de plato lo descarta.
watch(() => props.productId, discardDraft)
</script>

<template>
  <div class="flex flex-col gap-2" data-stations-panel>
    <p class="eyebrow">Estaciones {{ mappings.length ? `· ${mappings.length}` : '' }}</p>

    <!-- El estado que importa. En alerta y no en aviso: no es una mejora pendiente, es un plato
         que se cobra y nadie prepara. -->
    <p
      v-if="!mappings.length"
      class="rounded-lg border border-alert-400/50 bg-alert-50 px-3 py-2 text-[11px] leading-relaxed text-alert-700"
      data-no-station
    >
      Sin estación no se puede vender: nadie lo prepararía y la cocina nunca lo vería.
      <template v-if="canManage">Asígnale una abajo.</template>
    </p>

    <div
      v-for="m in mappings"
      :key="m.id"
      class="flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-3 py-2"
      data-station-mapping
    >
      <div class="flex items-center gap-2">
        <i class="pi pi-bolt text-[11px] text-steel-400" />
        <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {{ stationName(m.kitchen_station_id) }}
        </span>
        <button
          v-if="canManage"
          type="button"
          class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-steel-400 transition hover:text-alert-600 disabled:opacity-40"
          :disabled="busy"
          :aria-label="`Quitar ${stationName(m.kitchen_station_id)}`"
          data-detach-station
          @click="detach(m.kitchen_station_id)"
        >
          Quitar
        </button>
      </div>
      <!-- Qué hace ESA estación con ESTE plato. Opcional: sin rol el mapeo sigue enrutando. -->
      <input
        v-if="canManage"
        :value="m.role ?? ''"
        :disabled="busy"
        maxlength="60"
        placeholder="Qué hace aquí (opcional): «Carne y armado»"
        class="w-full rounded border border-line bg-paper px-2 py-1 text-[12px] text-ink placeholder:text-steel-400 disabled:opacity-60"
        data-station-role
        @change="setRole(m.id, ($event.target as HTMLInputElement).value)"
      />
      <p v-else-if="m.role" class="font-mono text-[11px] text-steel-500">{{ m.role }}</p>

      <!-- Las tareas: los renglones que el cocinero lee bajo el plato en el pase. Una fila por
           tarea, para que renombrar una derivada no la desconecte de su insumo. -->
      <template v-if="canManage">
        <div
          v-for="(t, i) in m.tasks"
          :key="`${m.id}-${i}`"
          class="flex items-center gap-1.5"
          data-task-row
        >
          <input
            :value="t.label"
            :disabled="busy"
            maxlength="60"
            class="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 text-[12px] text-ink disabled:opacity-60"
            :aria-label="`Tarea ${t.label}`"
            data-station-tasks
            @change="renameTask(m, i, ($event.target as HTMLInputElement).value)"
          />
          <span
            v-if="t.ingredient_id"
            class="shrink-0 font-mono text-[9px] uppercase tracking-wide text-steel-400"
            title="Sale de la receta: la cantidad se resuelve según la variante que se pida"
          >
            receta
          </span>
          <button
            type="button"
            class="shrink-0 text-steel-400 transition hover:text-alert-600 disabled:opacity-40"
            :disabled="busy"
            :aria-label="`Quitar ${t.label}`"
            data-remove-task
            @click="removeTask(m, i)"
          >
            <i class="pi pi-times text-[9px]" />
          </button>
        </div>
        <div v-if="m.tasks.length < MAX_TASKS" class="flex items-center gap-1.5">
          <input
            v-model="newTask[m.id]"
            :disabled="busy"
            maxlength="60"
            placeholder="Agregar paso: «Emplatar»"
            class="min-w-0 flex-1 rounded border border-dashed border-line bg-paper px-2 py-1 text-[12px] text-ink placeholder:text-steel-400 disabled:opacity-60"
            data-new-task
            @keyup.enter="addTask(m)"
          />
          <button
            type="button"
            class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-steel-400 transition hover:text-ink disabled:opacity-40"
            :disabled="busy || !(newTask[m.id] ?? '').trim()"
            data-add-task
            @click="addTask(m)"
          >
            Agregar
          </button>
        </div>
      </template>
      <p v-else-if="m.tasks.length" class="font-mono text-[11px] text-steel-500">
        {{ m.tasks.map((t) => t.label).join(' · ') }}
      </p>

      <!-- Deriva: la receta cambió desde que alguien confirmó estas tareas. Informa, no repara. -->
      <p
        v-if="driftByStation.get(m.kitchen_station_id)"
        class="rounded border border-ember/40 bg-ember/5 px-2 py-1 text-[11px] leading-snug text-ink"
        data-station-drift
      >
        La receta cambió desde que guardaste esto.
        <template v-if="driftByStation.get(m.kitchen_station_id)!.missing.length">
          Falta: {{ driftByStation.get(m.kitchen_station_id)!.missing.join(', ') }}.
        </template>
        <template v-if="driftByStation.get(m.kitchen_station_id)!.stale.length">
          Ya no está en la receta:
          {{ driftByStation.get(m.kitchen_station_id)!.stale.join(', ') }}.
        </template>
      </p>
    </div>

    <!-- El atajo a la pregunta que deja tildado a cualquiera aquí: qué le toca a cada estación.
         La respuesta ya está en la receta del plato; esto sólo la trae y la deja editar. -->
    <div v-if="canManage && kitchen.stations.length" class="flex flex-col gap-2">
      <button
        type="button"
        :disabled="busy || suggesting"
        class="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink transition hover:border-ember disabled:opacity-40"
        data-derive-stations
        @click="derive"
      >
        <i class="pi pi-sitemap text-[10px]" />
        {{ suggesting ? 'Leyendo la receta…' : 'Sugerir desde la receta' }}
      </button>

      <p v-if="nothingToDerive" class="text-[11px] leading-snug text-steel-500" data-nothing-derive>
        Este plato todavía no tiene receta, así que no hay de dónde deducirlo. Asígnale las
        estaciones a mano.
      </p>

      <!-- Borrador: se confirma o se descarta. Nada se guarda mientras esté aquí. -->
      <div v-if="draft.length" class="flex flex-col gap-2" data-derive-draft>
        <div
          v-for="row in draft"
          :key="row.stationId"
          class="flex flex-col gap-1.5 rounded-lg border border-ember/40 bg-ember/[0.04] px-3 py-2"
        >
          <label class="flex items-center gap-2">
            <input v-model="row.selected" type="checkbox" class="accent-ember" />
            <span class="text-[13px] font-medium text-ink">{{ row.stationName }}</span>
          </label>
          <div
            v-for="(t, i) in row.tasks"
            :key="`${row.stationId}-${i}`"
            class="flex items-center gap-1.5"
          >
            <input
              v-model="row.tasks[i]!.label"
              :disabled="!row.selected"
              maxlength="60"
              class="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 text-[12px] text-ink disabled:opacity-60"
              data-draft-tasks
            />
            <!-- Lo que la chit va a decir. Dos cantidades cuando las variantes no coinciden:
                 cada comanda recibirá la suya, y verlas aquí hace visible la diferencia. -->
            <span class="shrink-0 font-mono text-[10px] text-steel-500">
              {{ t.amounts.join(' / ') }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="confirming || !draft.some((d) => d.selected)"
            class="rounded-lg bg-graphite-900 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-paper transition disabled:opacity-40"
            data-confirm-derive
            @click="confirmDraft"
          >
            Guardar
          </button>
          <button
            type="button"
            class="font-mono text-[10px] uppercase tracking-wide text-steel-400 transition hover:text-ink"
            data-discard-derive
            @click="discardDraft"
          >
            Descartar
          </button>
        </div>
      </div>

      <!-- Los insumos que no aportan a ninguna estación: se nombran, no se pierden en silencio. -->
      <div
        v-if="suggestion?.unassigned_ingredients.length"
        class="rounded-lg border border-line bg-surface px-3 py-2"
        data-unassigned-ingredients
      >
        <p class="font-mono text-[10px] uppercase tracking-wide text-steel-400">
          Insumos sin estación
        </p>
        <p class="mt-0.5 text-[11px] leading-snug text-steel-500">
          <span v-for="(i, idx) in suggestion.unassigned_ingredients" :key="i.ingredient_id">
            {{ idx ? ' · ' : '' }}{{ i.name
            }}<span v-if="i.default_station_in_other_branch" class="text-ember"> (otra sede)</span>
          </span>
        </p>
        <p class="mt-1 text-[11px] leading-snug text-steel-500">
          Dales una estación en Inventario y volverán a salir aquí.
        </p>
      </div>
    </div>

    <div v-if="canManage && available.length" class="flex items-center gap-2">
      <select
        v-model="picking"
        :disabled="busy"
        class="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-1.5 text-[12px] text-ink disabled:opacity-60"
        aria-label="Estación a asignar"
        data-station-picker
      >
        <option value="">Añadir estación…</option>
        <option v-for="s in available" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <button
        type="button"
        :disabled="busy || !picking"
        class="shrink-0 rounded-lg bg-graphite-900 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-paper transition disabled:opacity-40"
        data-attach-station
        @click="attach"
      >
        Asignar
      </button>
    </div>

    <!-- Sin estaciones creadas no hay nada que asignar, y decirlo evita buscar un desplegable
         vacío que parece roto. -->
    <p
      v-else-if="canManage && !kitchen.stations.length"
      class="font-mono text-[11px] text-steel-400"
    >
      Esta sede todavía no tiene estaciones de cocina creadas.
    </p>

    <p v-if="error" class="text-[11px] text-alert-600">{{ error }}</p>
  </div>
</template>
