<script setup lang="ts">
// Slide-in detail for one route: zones as editable chips, and the crew — the drivers riding
// this ring. Assigned drivers come with their DERIVED status (the dispatch runs produce it);
// the assignable pool is the branch's active employees not yet on the route. Removal is a
// two-tap confirm inline (no browser dialogs on a dispatch screen).
import { computed, ref, watch } from 'vue'
import type { DeliveryRoute, Driver } from '@/lib/deliveryRoutes'
import { DRIVER_STATUS_META, ringRangeLabel, routeCode } from '@/lib/deliveryRoutes'

const props = defineProps<{
  route: DeliveryRoute
  ringIndex: number
  stepKm: number
  assigned: Driver[]
  assignable: { id: string; name: string }[]
  canManage: boolean
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit'): void
  (e: 'toggle-active'): void
  (e: 'add-zone', zone: string): void
  (e: 'remove-zone', zone: string): void
  (e: 'assign-driver', driverId: string): void
  (e: 'remove-driver', driverId: string): void
}>()

// --- zones ------------------------------------------------------------------
const addingZone = ref(false)
const zoneDraft = ref('')
function confirmZone() {
  const zone = zoneDraft.value.trim()
  if (zone) emit('add-zone', zone)
  zoneDraft.value = ''
  addingZone.value = false
}

// --- assign modal -------------------------------------------------------------
const assignOpen = ref(false)
const driverQuery = ref('')
const searchResults = computed(() => {
  const q = driverQuery.value.trim().toLowerCase()
  return q ? props.assignable.filter((d) => d.name.toLowerCase().includes(q)) : props.assignable
})
function assign(driverId: string) {
  emit('assign-driver', driverId)
  assignOpen.value = false
  driverQuery.value = ''
}

// --- two-tap remove confirm ---------------------------------------------------
const confirmingRemove = ref<string | null>(null)
watch(
  () => props.route.id,
  () => {
    confirmingRemove.value = null
    addingZone.value = false
    assignOpen.value = false
  },
)
</script>

<template>
  <aside
    class="pointer-events-auto flex h-full w-[360px] flex-col overflow-hidden bg-paper shadow-[-16px_0_44px_-20px_rgb(0_0_0/0.45)] ring-1 ring-black/10"
  >
    <!-- Header -->
    <header class="border-b border-line px-4 pb-3 pt-4">
      <div class="flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Cerrar detalle"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          @click="emit('close')"
        >
          <i class="pi pi-arrow-left text-sm" />
        </button>
        <span
          class="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-[12px] font-bold text-white"
          :style="{ background: route.color }"
        >
          {{ routeCode(route.name) }}
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="truncate font-display text-lg font-extrabold leading-tight text-ink">
            {{ route.name }}
          </h2>
          <p class="font-mono text-[11px] tabular-nums text-steel-500">
            <template v-if="route.isActive && ringIndex >= 0">{{ ringRangeLabel(ringIndex, stepKm) }}</template>
            <template v-else>Sin anillo<span class="text-alert"> · inactiva</span></template>
          </p>
        </div>
      </div>
      <div v-if="canManage" class="mt-3 flex gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-600 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          @click="emit('edit')"
        >
          <i class="pi pi-pencil text-[10px]" /> Editar
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          :class="route.isActive ? 'text-steel-600 hover:bg-sunken hover:text-alert' : 'text-success hover:bg-sunken'"
          @click="emit('toggle-active')"
        >
          <i class="pi text-[10px]" :class="route.isActive ? 'pi-ban' : 'pi-check-circle'" />
          {{ route.isActive ? 'Desactivar' : 'Activar' }}
        </button>
      </div>
    </header>

    <div class="flex-1 space-y-5 overflow-y-auto px-4 py-4">
      <!-- Zones -->
      <section>
        <p class="eyebrow mb-2">Zonas cubiertas</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="zone in route.zones"
            :key="zone"
            class="flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 font-mono text-[11px] text-ink"
          >
            {{ zone }}
            <button
              v-if="canManage"
              type="button"
              :aria-label="`Quitar zona ${zone}`"
              class="text-steel-500 transition hover:text-alert"
              @click="emit('remove-zone', zone)"
            >
              <i class="pi pi-times text-[9px]" />
            </button>
          </span>
          <input
            v-if="addingZone"
            v-model="zoneDraft"
            placeholder="Nombre de la zona"
            class="w-36 rounded-full border border-ember/50 bg-surface px-2.5 py-1 font-mono text-[11px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            @keyup.enter="confirmZone"
            @keyup.esc="addingZone = false"
            @blur="confirmZone"
          />
          <button
            v-else-if="canManage"
            type="button"
            class="rounded-full border border-dashed border-steel-300 px-2.5 py-1 font-mono text-[11px] text-steel-500 transition hover:border-ember hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            @click="addingZone = true"
          >
            + Agregar zona
          </button>
        </div>
      </section>

      <!-- Drivers -->
      <section>
        <div class="mb-2 flex items-center justify-between">
          <p class="eyebrow">Conductores</p>
          <button
            v-if="canManage"
            type="button"
            class="rounded-lg bg-ember px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-graphite-900 transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            @click="assignOpen = true"
          >
            + Asignar
          </button>
        </div>

        <ul v-if="assigned.length" class="overflow-hidden rounded-xl border border-line">
          <li
            v-for="driver in assigned"
            :key="driver.id"
            class="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 transition last:border-0 hover:bg-sunken/60"
          >
            <span class="text-[16px]" aria-hidden="true">🛵</span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-medium text-ink">{{ driver.name }}</p>
              <span class="pill mt-0.5" :class="DRIVER_STATUS_META[driver.status].pill">
                {{ DRIVER_STATUS_META[driver.status].label }}
              </span>
            </div>
            <button
              v-if="canManage && confirmingRemove !== driver.id"
              type="button"
              :aria-label="`Quitar a ${driver.name} de la ruta`"
              class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-steel-400 transition hover:bg-alert/10 hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              @click="confirmingRemove = driver.id"
            >
              <i class="pi pi-trash text-[12px]" />
            </button>
            <button
              v-else
              type="button"
              class="shrink-0 rounded-lg bg-alert px-2 py-1 font-mono text-[10px] font-bold uppercase text-white transition hover:bg-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/40"
              @click="emit('remove-driver', driver.id); confirmingRemove = null"
            >
              ¿Quitar?
            </button>
          </li>
        </ul>
        <p
          v-else
          class="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[12px] text-muted"
        >
          Esta ruta aún no tiene conductores. Asigna uno para empezar a despachar.
        </p>
      </section>
    </div>

    <!-- Assign driver modal -->
    <div
      v-if="assignOpen"
      class="absolute inset-0 z-20 grid place-items-center bg-black/35 p-6"
      role="dialog"
      aria-modal="true"
      @click.self="assignOpen = false"
    >
      <div class="w-full max-w-xs overflow-hidden rounded-2xl bg-paper shadow-2xl ring-1 ring-black/10">
        <div class="border-b border-line px-4 py-3">
          <h3 class="font-display text-[15px] font-extrabold text-ink">
            Asignar conductor
          </h3>
          <p class="font-mono text-[11px] text-steel-500">a {{ route.name }}</p>
        </div>
        <div class="p-3">
          <div class="relative mb-2">
            <i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-steel-400" />
            <input
              v-model="driverQuery"
              placeholder="Buscar conductor…"
              class="w-full rounded-lg border border-line bg-surface py-1.5 pl-7 pr-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            />
          </div>
          <ul class="max-h-52 overflow-y-auto">
            <li v-for="driver in searchResults" :key="driver.id">
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                @click="assign(driver.id)"
              >
                <span
                  class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[11px] font-bold text-steel-600"
                >
                  {{ driver.name.slice(0, 1).toUpperCase() }}
                </span>
                <span class="min-w-0 flex-1 truncate text-[13px] text-ink">{{ driver.name }}</span>
              </button>
            </li>
            <li v-if="!searchResults.length" class="px-2 py-4 text-center text-[12px] text-muted">
              No hay conductores libres con ese nombre.
            </li>
          </ul>
          <div class="mt-2 flex justify-end">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              @click="assignOpen = false"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
