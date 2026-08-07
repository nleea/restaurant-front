<script setup lang="ts">
// Configuración de cocina: qué estaciones tiene esta sede y en qué orden salen en el pase.
//
// Antes esta pantalla también asignaba platos a estaciones, con un desplegable de productos que
// obligaba a saber de antemano cuál ibas a configurar. Eso vive ahora en la carta, junto al plato
// —que es donde está la persona cuando hace falta— y con la receta a mano para deducir las tareas.
// Aquí quedó lo que sólo se puede hacer aquí: montar la línea. Y lo que sólo se ve desde aquí:
// qué platos siguen sin que nadie los prepare.
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { useBranchStore } from '@/stores/branch'
import { useKitchenStore } from '@/stores/kitchen'

const branch = useBranchStore()
const kitchen = useKitchenStore()

const error = ref<string | null>(null)
const busy = ref(false)

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

// --- Estaciones --------------------------------------------------------------
// El orden es el del pase, no un número que alguien tenga que inventar: se mueve con flechas y
// la posición se calcula sola. Pedir "posición 3" en un campo numérico era pedir que la persona
// llevara la cuenta de una lista que ya está en pantalla.
const ordered = computed(() =>
  [...kitchen.stations].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
)

const newName = ref('')
const creating = ref(false)

async function createStation() {
  const name = newName.value.trim()
  if (!branch.activeBranchId || !name) return
  creating.value = true
  error.value = null
  try {
    // Nace al final de la línea: el sitio donde no estorba a nada de lo ya montado.
    const position = ordered.value.length
    await kitchen.createStation(branch.activeBranchId, name, position)
    newName.value = ''
  } catch {
    error.value = 'No se pudo crear la estación.'
  } finally {
    creating.value = false
  }
}

const toggleActive = (stationId: string, isActive: boolean) => {
  if (!branch.activeBranchId) return
  const branchId = branch.activeBranchId
  return run(
    () => kitchen.updateStation(branchId, stationId, { is_active: isActive }),
    'No se pudo actualizar la estación.',
  )
}

const rename = (stationId: string, name: string) => {
  const trimmed = name.trim()
  if (!branch.activeBranchId || !trimmed) return
  const branchId = branch.activeBranchId
  return run(
    () => kitchen.updateStation(branchId, stationId, { name: trimmed }),
    'No se pudo renombrar la estación.',
  )
}

/** Intercambia la posición con la vecina: dos escrituras, ningún hueco en la numeración. */
function move(index: number, delta: -1 | 1) {
  const branchId = branch.activeBranchId
  const list = ordered.value
  const current = list[index]
  const neighbour = list[index + delta]
  if (!branchId || !current || !neighbour) return
  return run(async () => {
    await kitchen.updateStation(branchId, current.id, { position: neighbour.position })
    await kitchen.updateStation(branchId, neighbour.id, { position: current.position })
  }, 'No se pudo reordenar.')
}

// --- Lo que falta ------------------------------------------------------------
// Un plato sin estación es invisible: se ve normal en la carta y sólo deja de existir cuando la
// cocina debería haberlo recibido, con el pedido ya cobrado. Por eso la pantalla ARRANCA por lo
// pendiente en vez de esperar a que alguien piense en revisarlo.
const pending = computed(() => kitchen.unroutableProducts)

onMounted(() => {
  void kitchen.loadUnroutableProducts().catch(() => undefined)
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
    >
      {{ error }}
    </p>

    <!-- Pendiente primero: es lo único de esta pantalla que se está cobrando ahora mismo -->
    <section v-if="pending.length" class="rounded-xl border border-alert/40 bg-alert/5 p-4">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.16em] text-alert">
        Platos que nadie prepara · {{ pending.length }}
      </h2>
      <p class="mt-1 text-[12px] leading-snug text-steel-600">
        Sin estación no llegan a la cocina. Se asignan desde la carta, junto al plato.
      </p>
      <ul class="mt-3 flex flex-col gap-1.5">
        <li
          v-for="p in pending"
          :key="p.product_id"
          class="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm text-ink">{{ p.name }}</span>
            <span class="font-mono text-[11px] text-steel-500">
              {{ p.category_name ?? 'sin categoría' }}
              <template v-if="p.active_variants">
                · {{ p.active_variants }} a la venta
              </template>
              <template v-else> · sin variantes activas</template>
            </span>
          </span>
          <!-- Lo urgente es lo que ya se vende; lo demás es una ficha a medio crear. -->
          <span
            v-if="p.active_variants"
            class="shrink-0 rounded-full bg-alert/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-alert"
          >
            se vende
          </span>
        </li>
      </ul>
      <RouterLink
        :to="{ name: 'menu' }"
        class="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-ember transition hover:text-ink"
      >
        Ir a la carta a asignarlas
        <i class="pi pi-arrow-right text-[10px]" />
      </RouterLink>
    </section>

    <!-- Estaciones -->
    <section class="rounded-xl border border-line p-4">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.16em] text-ember">
        Estaciones de esta sede
      </h2>
      <p class="mt-1 text-[12px] leading-snug text-steel-500">
        El orden es el del pase: la primera de la lista es la primera del tablero.
      </p>

      <ul v-if="ordered.length" class="mt-3 mb-4 flex flex-col gap-1.5">
        <li
          v-for="(s, i) in ordered"
          :key="s.id"
          class="flex items-center gap-2 rounded-lg border border-line bg-app px-3 py-2"
          data-station-row
        >
          <span class="flex shrink-0 flex-col">
            <button
              type="button"
              class="text-steel-400 transition hover:text-ink disabled:opacity-25"
              :disabled="busy || i === 0"
              :aria-label="`Subir ${s.name}`"
              data-move-up
              @click="move(i, -1)"
            >
              <i class="pi pi-chevron-up text-[9px]" />
            </button>
            <button
              type="button"
              class="text-steel-400 transition hover:text-ink disabled:opacity-25"
              :disabled="busy || i === ordered.length - 1"
              :aria-label="`Bajar ${s.name}`"
              data-move-down
              @click="move(i, 1)"
            >
              <i class="pi pi-chevron-down text-[9px]" />
            </button>
          </span>
          <input
            :value="s.name"
            :disabled="busy"
            maxlength="100"
            class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-ink transition hover:border-line focus:border-line disabled:opacity-60"
            :aria-label="`Nombre de ${s.name}`"
            data-station-name
            @change="rename(s.id, ($event.target as HTMLInputElement).value)"
          />
          <span class="flex shrink-0 items-center gap-2">
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
              {{ s.is_active ? 'en servicio' : 'apagada' }}
            </span>
            <ToggleSwitch
              :model-value="s.is_active"
              :aria-label="`Poner ${s.name} en servicio`"
              @update:model-value="(v: boolean) => toggleActive(s.id, v)"
            />
          </span>
        </li>
      </ul>
      <p v-else class="mt-3 mb-4 text-sm text-steel-500">
        Todavía no hay estaciones. Crea las de tu línea — parrilla, fríos, bebidas — y el tablero
        del pase se arma solo con ellas.
      </p>

      <div class="flex items-end gap-2">
        <div class="flex flex-1 flex-col gap-1">
          <label for="st-name" class="text-xs text-steel-500">Nueva estación</label>
          <InputText
            id="st-name"
            v-model="newName"
            placeholder="Parrilla"
            fluid
            @keyup.enter="createStation"
          />
        </div>
        <Button
          label="Crear"
          size="small"
          icon="pi pi-plus"
          :loading="creating"
          :disabled="newName.trim() === ''"
          @click="createStation"
        />
      </div>
    </section>
  </div>
</template>
