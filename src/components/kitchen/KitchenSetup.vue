<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import type { ProductStation } from '@/services/kitchen.api'
import { useBranchStore } from '@/stores/branch'
import { useKitchenStore } from '@/stores/kitchen'
import { useMenuStore } from '@/stores/menu'

const branch = useBranchStore()
const kitchen = useKitchenStore()
const menu = useMenuStore()

const error = ref<string | null>(null)

// --- Stations --------------------------------------------------------------
const newName = ref('')
const newPosition = ref<number>(0)
const creating = ref(false)

async function createStation() {
  if (!branch.activeBranchId || newName.value.trim() === '') return
  creating.value = true
  error.value = null
  try {
    await kitchen.createStation(branch.activeBranchId, newName.value.trim(), newPosition.value)
    newName.value = ''
    newPosition.value = 0
  } catch {
    error.value = 'No se pudo crear la estación.'
  } finally {
    creating.value = false
  }
}

async function toggleActive(stationId: string, isActive: boolean) {
  if (!branch.activeBranchId) return
  error.value = null
  try {
    await kitchen.updateStation(branch.activeBranchId, stationId, { is_active: isActive })
  } catch {
    error.value = 'No se pudo actualizar la estación.'
  }
}

// --- Product → station mapping ---------------------------------------------
const productId = ref<string | null>(null)
const mapStationId = ref<string | null>(null)
const mapRole = ref('')
const mapping = ref(false)

const productOptions = computed(() => menu.products.map((p) => ({ label: p.name, value: p.id })))
const stationOptions = computed(() => kitchen.stations.map((s) => ({ label: s.name, value: s.id })))
const stationName = (id: string) => kitchen.stations.find((s) => s.id === id)?.name ?? id
const currentMappings = computed(() =>
  productId.value ? kitchen.stationsForProduct(productId.value) : [],
)

watch(productId, (id) => {
  if (id) void kitchen.loadProductStations(id)
})

async function attach() {
  if (!productId.value || !mapStationId.value) return
  mapping.value = true
  error.value = null
  try {
    await kitchen.attachProduct(productId.value, mapStationId.value, mapRole.value.trim() || null)
    mapStationId.value = null
    mapRole.value = ''
  } catch {
    error.value = 'No se pudo asociar el producto a la estación.'
  } finally {
    mapping.value = false
  }
}

async function detach(stationId: string) {
  if (!productId.value) return
  error.value = null
  try {
    await kitchen.detachProduct(productId.value, stationId)
  } catch {
    error.value = 'No se pudo quitar la asociación.'
  }
}

// --- Mapping editor: role + itemized station tasks ---------------------------
// Tasks are what the board's component lists as sub-lines ("Carne de hamburguesa",
// "Tocineta ahumada"). Tickets already fired keep the tasks captured at routing time.
const MAX_TASKS = 10
const editingId = ref<string | null>(null)
const editRole = ref('')
const editTasks = ref<string[]>([])
const newTask = ref('')
const savingEdit = ref(false)

function startEdit(m: ProductStation) {
  editingId.value = m.id
  editRole.value = m.role ?? ''
  editTasks.value = [...m.tasks]
  newTask.value = ''
}
function cancelEdit() {
  editingId.value = null
}
function addTask() {
  const task = newTask.value.trim()
  if (!task || editTasks.value.length >= MAX_TASKS) return
  editTasks.value.push(task)
  newTask.value = ''
}
function removeTask(index: number) {
  editTasks.value.splice(index, 1)
}
async function saveEdit() {
  if (!productId.value || !editingId.value) return
  savingEdit.value = true
  error.value = null
  try {
    await kitchen.updateMapping(productId.value, editingId.value, {
      role: editRole.value.trim() || null,
      tasks: editTasks.value,
    })
    editingId.value = null
  } catch {
    error.value = 'No se pudo actualizar la asignación.'
  } finally {
    savingEdit.value = false
  }
}

const editingMapping = computed(() =>
  editingId.value ? (currentMappings.value.find((m) => m.id === editingId.value) ?? null) : null,
)

// Close the editor if the selected product changes underneath it.
watch(productId, () => {
  editingId.value = null
})

onMounted(() => {
  if (!menu.products.length) void menu.fetchProducts()
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

    <!-- Stations -->
    <section class="rounded-xl border border-line p-4">
      <h2 class="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">Estaciones</h2>

      <ul v-if="kitchen.stations.length" class="mb-4 flex flex-col gap-1.5">
        <li
          v-for="s in kitchen.stations"
          :key="s.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-line bg-app px-3 py-2"
        >
          <span class="min-w-0">
            <span class="block truncate text-sm text-ink">{{ s.name }}</span>
            <span class="font-mono text-[11px] text-steel-500">posición {{ s.position }}</span>
          </span>
          <span class="flex shrink-0 items-center gap-2">
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
              {{ s.is_active ? 'activa' : 'inactiva' }}
            </span>
            <ToggleSwitch
              :model-value="s.is_active"
              @update:model-value="(v: boolean) => toggleActive(s.id, v)"
            />
          </span>
        </li>
      </ul>
      <p v-else class="mb-4 text-sm text-steel-500">Sin estaciones.</p>

      <div class="flex items-end gap-2">
        <div class="flex flex-1 flex-col gap-1">
          <label for="st-name" class="text-xs text-steel-500">Nombre</label>
          <InputText id="st-name" v-model="newName" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label for="st-pos" class="text-xs text-steel-500">Posición</label>
          <InputNumber v-model="newPosition" input-id="st-pos" :min="0" class="w-24" />
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

    <!-- Product → station mapping -->
    <section class="rounded-xl border border-line p-4">
      <h2 class="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ember">
        Productos por estación
      </h2>

      <div class="mb-3 flex flex-col gap-2">
        <Select
          v-model="productId"
          :options="productOptions"
          option-label="label"
          option-value="value"
          placeholder="Producto"
          filter
          fluid
        />
        <div class="flex items-end gap-2">
          <Select
            v-model="mapStationId"
            :options="stationOptions"
            option-label="label"
            option-value="value"
            placeholder="Estación"
            :disabled="!productId"
            fluid
          />
          <InputText
            v-model="mapRole"
            placeholder="Rol (opcional)"
            maxlength="60"
            :disabled="!productId"
            fluid
          />
          <Button
            label="Asociar"
            size="small"
            icon="pi pi-link"
            :loading="mapping"
            :disabled="!productId || !mapStationId"
            @click="attach"
          />
        </div>
      </div>

      <div v-if="productId" class="flex flex-wrap gap-1.5">
        <span
          v-for="m in currentMappings"
          :key="m.id"
          class="flex items-center gap-1.5 rounded-full border border-ember/40 bg-ember/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-ember"
        >
          {{ stationName(m.kitchen_station_id) }}
          <span v-if="m.role" class="text-ember/60 normal-case">· {{ m.role }}</span>
          <span v-if="m.tasks.length" class="text-ember/60 normal-case">
            · {{ m.tasks.length }} tarea{{ m.tasks.length === 1 ? '' : 's' }}
          </span>
          <button
            type="button"
            aria-label="Editar tareas"
            class="text-ember/70 transition hover:text-ink"
            @click="startEdit(m)"
          >
            <i class="pi pi-pencil text-[10px]" />
          </button>
          <button
            type="button"
            aria-label="Quitar estación"
            class="text-ember/70 transition hover:text-alert"
            @click="detach(m.kitchen_station_id)"
          >
            <i class="pi pi-times text-[10px]" />
          </button>
        </span>
        <span v-if="!currentMappings.length" class="font-mono text-[11px] text-steel-500">
          Este producto no tiene estaciones asociadas.
        </span>
      </div>

      <!-- Mapping editor: role + itemized tasks the board lists under the component -->
      <div
        v-if="editingMapping"
        class="mt-3 flex flex-col gap-3 rounded-xl border border-ember/30 bg-ember/[0.04] p-3"
      >
        <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-ember">
          {{ stationName(editingMapping.kitchen_station_id) }} — rol y tareas
        </p>

        <div class="flex flex-col gap-1">
          <label for="map-edit-role" class="text-xs text-steel-500">Rol (nombre del componente)</label>
          <InputText id="map-edit-role" v-model="editRole" maxlength="60" fluid />
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-steel-500">Tareas (lo que esta estación hace para el plato)</span>
          <ul v-if="editTasks.length" class="flex flex-col gap-1">
            <li
              v-for="(task, i) in editTasks"
              :key="i"
              class="flex items-center justify-between gap-2 rounded-lg border border-line bg-app px-2.5 py-1.5"
            >
              <span class="min-w-0 truncate font-mono text-[12px] text-ink">· {{ task }}</span>
              <button
                type="button"
                aria-label="Quitar tarea"
                class="shrink-0 text-steel-500 transition hover:text-alert"
                @click="removeTask(i)"
              >
                <i class="pi pi-times text-[10px]" />
              </button>
            </li>
          </ul>
          <div class="flex items-center gap-2">
            <InputText
              v-model="newTask"
              placeholder="p. ej. Tocineta ahumada"
              maxlength="60"
              :disabled="editTasks.length >= MAX_TASKS"
              fluid
              @keyup.enter="addTask"
            />
            <Button
              label="Agregar"
              size="small"
              icon="pi pi-plus"
              severity="secondary"
              :disabled="newTask.trim() === '' || editTasks.length >= MAX_TASKS"
              @click="addTask"
            />
          </div>
          <p class="font-mono text-[10px] text-steel-500">
            Máx. {{ MAX_TASKS }} tareas. Las comandas ya enviadas conservan sus tareas; los
            cambios aplican a lo que se rutee de aquí en adelante.
          </p>
        </div>

        <div class="flex justify-end gap-2">
          <Button label="Cancelar" size="small" severity="secondary" text @click="cancelEdit" />
          <Button
            label="Guardar"
            size="small"
            icon="pi pi-check"
            :loading="savingEdit"
            @click="saveEdit"
          />
        </div>
      </div>
    </section>
  </div>
</template>
