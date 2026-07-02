<script setup lang="ts">
// "Domicilios" — delivery coverage around the business, on real data: routes list (left), the
// live ring map (right), radius configurator docked on the map and a slide-in detail per route.
// Backed by the /delivery API through the delivery store (write-through); driver names come from
// the staff directory and driver status is derived server-side from dispatch runs. The per-order
// lifecycle lives in /dispatch — this screen is the coverage plan.
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import RadiusPanel from '@/components/deliveryroutes/RadiusPanel.vue'
import RouteDetailPanel from '@/components/deliveryroutes/RouteDetailPanel.vue'
import { createRingsMap, type RingsController } from '@/components/deliveryroutes/useLeafletRings'
import type { DeliveryRoute, Driver } from '@/lib/deliveryRoutes'
import { openDeliveryPoints, RING_COLORS, RING_STEP_DEFAULT_KM, routeCode } from '@/lib/deliveryRoutes'
import { statusOf } from '@/lib/apiError'
import type { Employee } from '@/services/staff.api'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useDeliveryStore } from '@/stores/delivery'
import { useDispatchStore } from '@/stores/dispatch'
import { useStaffStore } from '@/stores/staff'

const auth = useAuthStore()
const branch = useBranchStore()
const delivery = useDeliveryStore()
const dispatch = useDispatchStore()
const staff = useStaffStore()

const canManage = computed(() => auth.can('delivery.manage'))

const loading = ref(false)
const error = ref<string | null>(null)
const onlyActive = ref(true)

// --- view model: API rows → the map components' shapes -------------------------
// delivery.routes come band-ordered (position); index = band. Color falls back to the palette.
const routes = computed<DeliveryRoute[]>(() =>
  delivery.routes.map((r) => ({
    id: r.id,
    name: r.name,
    zones: r.zones,
    color: r.color ?? (RING_COLORS[r.position % RING_COLORS.length] as string),
    isActive: r.is_active,
    driverIds: [],
  })),
)
const selectedId = computed(() => delivery.selectedRouteId)
const selectedRoute = computed(() => routes.value.find((r) => r.id === selectedId.value) ?? null)
// The coverage plan is the ACTIVE routes: bands compact among them (one active route = the
// innermost ring), and inactive routes have no ring at all — they live only in the list.
const activeRoutes = computed(() => routes.value.filter((r) => r.isActive))
const selectedBand = computed(() => activeRoutes.value.findIndex((r) => r.id === selectedId.value))
const visibleRoutes = computed(() => (onlyActive.value ? activeRoutes.value : routes.value))

function employeeName(employeeId: string): string {
  const employee = staff.employees.find((e: Employee) => e.id === employeeId)
  return employee ? staff.employeeName(employee) : `#${employeeId.slice(0, 8)}`
}
const assignedDrivers = computed<Driver[]>(() =>
  delivery.drivers.map((d) => ({
    id: d.employee_id,
    name: employeeName(d.employee_id),
    status: d.status,
  })),
)
const assignablePool = computed(() => {
  const taken = new Set(delivery.drivers.map((d) => d.employee_id))
  return staff.employees
    .filter((e) => e.is_active && !taken.has(e.id))
    .map((e) => ({ id: e.id, name: staff.employeeName(e) }))
})

// --- ring step: local for instant redraw, persisted debounced -------------------
const stepKm = ref(RING_STEP_DEFAULT_KM)
let stepSaveTimer: ReturnType<typeof setTimeout> | undefined
watch(stepKm, (value) => {
  if (!canManage.value || !delivery.settings) return
  if (stepSaveTimer) clearTimeout(stepSaveTimer)
  stepSaveTimer = setTimeout(() => {
    if (Number(delivery.settings?.ring_step_km) !== value) {
      void delivery.saveSettings({ ring_step_km: String(value) }).catch(() => {
        error.value = 'No se pudo guardar el radio por ruta.'
      })
    }
  }, 500)
})

// --- live deliveries overlay: demand dots over the coverage rings ----------------
const showDeliveries = ref(true)
const deliveryOverlay = computed(() => openDeliveryPoints(dispatch.deliveries))

function syncDeliveryDots() {
  rings?.setDeliveryPoints(showDeliveries.value ? deliveryOverlay.value.points : [])
}

const center = computed<[number, number] | null>(() => {
  const s = delivery.settings
  if (!s || s.latitude == null || s.longitude == null) return null
  return [Number(s.latitude), Number(s.longitude)]
})

// --- map --------------------------------------------------------------------------
const mapEl = ref<HTMLElement | null>(null)
const mapError = ref(false)
const radiusOpen = ref(true)
let rings: RingsController | null = null

// Location onboarding / relocation: the next map click is the candidate pin.
const picking = ref(false)
const pendingPin = ref<[number, number] | null>(null)
const savingPin = ref(false)

function syncMap() {
  // Only active routes ring the map; a deactivated route's circle is removed outright.
  rings?.sync(activeRoutes.value, stepKm.value, selectedId.value, false)
}

function startPicking() {
  if (!canManage.value) return
  picking.value = true
  pendingPin.value = null
  // The device location is only a centering SUGGESTION (also when relocating a wrong pin) —
  // denial never blocks: the banner tells the user to drag the map and tap.
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (picking.value) rings?.centerOn([position.coords.latitude, position.coords.longitude])
      },
      () => undefined,
      { timeout: 5000 },
    )
  }
}
function cancelPicking() {
  picking.value = false
  pendingPin.value = null
  rings?.hidePinPreview()
}
async function savePin() {
  if (!pendingPin.value) return
  savingPin.value = true
  error.value = null
  try {
    const [lat, lng] = pendingPin.value
    await delivery.saveSettings({ latitude: lat.toFixed(7), longitude: lng.toFixed(7) })
    cancelPicking()
  } catch {
    error.value = 'No se pudo guardar la ubicación del negocio.'
  } finally {
    savingPin.value = false
  }
}

async function select(routeId: string, { fly = true }: { fly?: boolean } = {}) {
  try {
    await delivery.selectRoute(routeId)
  } catch {
    error.value = 'No se pudieron cargar los conductores de la ruta.'
  }
  if (fly) rings?.focusRing(routeId)
}
function closeDetail() {
  delivery.selectedRouteId = null
}

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await Promise.all([
        delivery.loadRoutes(branch.activeBranchId),
        delivery.loadSettings(branch.activeBranchId),
        staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
        dispatch.loadDeliveries(),
      ])
      const step = Number(delivery.settings?.ring_step_km)
      if (Number.isFinite(step) && step > 0) stepKm.value = step
    }
  } catch {
    error.value = 'No se pudieron cargar los domicilios.'
  } finally {
    loading.value = false
  }
}

// One deterministic navigation: frame the outermost active ring, or the bare pin without rings.
function frameInitial() {
  const outermost = activeRoutes.value[activeRoutes.value.length - 1]
  if (outermost && center.value) rings?.frameRing(outermost.id)
  else if (center.value) rings?.centerOn(center.value, 14)
}

onMounted(async () => {
  await load()
  if (!mapEl.value) return
  try {
    rings = await createRingsMap(mapEl.value, {
      // While picking a location, ring clicks must not hijack the tap (they would open the
      // detail and fly the view back to the old pin) — the tap is the new pin, nothing else.
      onRingClick: (routeId) => {
        if (picking.value) return
        void select(routeId, { fly: false })
      },
      onMapClick: (coords) => {
        if (!picking.value || !canManage.value) return
        pendingPin.value = coords
        rings?.showPinPreview(coords)
      },
    })
    rings.setCenter(center.value)
    syncMap()
    syncDeliveryDots()
    if (center.value) frameInitial()
    else if (canManage.value) startPicking()
  } catch {
    mapError.value = true
  }
})

watch([deliveryOverlay, showDeliveries], syncDeliveryDots)
onUnmounted(() => {
  if (stepSaveTimer) clearTimeout(stepSaveTimer)
  rings?.destroy()
})

watch(center, (next) => {
  rings?.setCenter(next)
  syncMap()
  if (next) frameInitial()
})
watch(
  [() => routes.value.map((r) => `${r.id}:${r.color}:${r.isActive}`).join(), stepKm, selectedId, onlyActive],
  syncMap,
)
watch(
  () => branch.activeBranchId,
  async () => {
    delivery.selectedRouteId = null
    delivery.drivers = []
    cancelPicking()
    await load()
    rings?.setCenter(center.value)
    syncMap()
  },
)

// --- route form (create + edit share it) ---------------------------------------
const form = reactive({
  open: false,
  editingId: null as string | null,
  name: '',
  zones: [] as string[],
  zoneDraft: '',
  color: RING_COLORS[0] as string,
  saving: false,
})

function openCreate() {
  form.open = true
  form.editingId = null
  form.name = ''
  form.zones = []
  form.zoneDraft = ''
  form.color = RING_COLORS[routes.value.length % RING_COLORS.length] as string
}
function openEdit(route: DeliveryRoute) {
  form.open = true
  form.editingId = route.id
  form.name = route.name
  form.zones = [...route.zones]
  form.zoneDraft = ''
  form.color = route.color
}
function addFormZone() {
  const zone = form.zoneDraft.trim()
  if (zone && !form.zones.includes(zone)) form.zones.push(zone)
  form.zoneDraft = ''
}
function closeForm() {
  form.open = false
  rings?.hidePreview()
}
async function saveForm() {
  const name = form.name.trim()
  if (!name || !branch.activeBranchId) return
  form.saving = true
  error.value = null
  try {
    if (form.editingId) {
      await delivery.updateRoute(form.editingId, { name, zones: [...form.zones], color: form.color })
    } else {
      const route = await delivery.createRoute({
        branch_id: branch.activeBranchId,
        name,
        zones: [...form.zones],
        color: form.color,
      })
      await select(route.id, { fly: false })
    }
    closeForm()
  } catch (e) {
    error.value =
      statusOf(e) === 422 ? 'Datos inválidos: revisa nombre y zonas.' : 'No se pudo guardar la ruta.'
  } finally {
    form.saving = false
  }
}

// Preview the ring (dashed) while the form is open: at its own band when editing, at the next
// free band when creating.
watch(
  () => [form.open, form.color, form.editingId, stepKm.value] as const,
  () => {
    if (!form.open) return rings?.hidePreview()
    // Preview at the route's own band when editing an active route, or at the next free band
    // when creating; an inactive route has no band to preview.
    const index = form.editingId
      ? activeRoutes.value.findIndex((r) => r.id === form.editingId)
      : activeRoutes.value.length
    if (form.editingId && index < 0) return rings?.hidePreview()
    rings?.showPreview(form.color, index, stepKm.value)
  },
)

// --- detail actions ----------------------------------------------------------------
async function toggleActive(route: DeliveryRoute) {
  try {
    await delivery.updateRoute(route.id, { is_active: !route.isActive })
  } catch {
    error.value = 'No se pudo cambiar el estado de la ruta.'
  }
}
async function saveZones(route: DeliveryRoute, zones: string[]) {
  try {
    await delivery.updateRoute(route.id, { zones })
  } catch (e) {
    error.value = statusOf(e) === 422 ? 'Zona inválida (máx. 20 zonas de 60 caracteres).' : 'No se pudo guardar la zona.'
  }
}
async function assignDriver(route: DeliveryRoute, employeeId: string) {
  try {
    await delivery.assignDriver(route.id, employeeId)
  } catch (e) {
    error.value =
      statusOf(e) === 409 ? 'Ese conductor ya está asignado a la ruta.' : 'No se pudo asignar el conductor.'
  }
}
async function removeDriver(route: DeliveryRoute, employeeId: string) {
  try {
    await delivery.removeDriver(route.id, employeeId)
  } catch {
    error.value = 'No se pudo quitar el conductor.'
  }
}
</script>

<template>
  <AppShell>
    <div class="flex h-dvh flex-col bg-app lg:flex-row">
      <!-- LEFT: the dispatcher's manifest -->
      <aside
        class="flex w-full shrink-0 flex-col border-b border-line bg-surface max-lg:h-[45%] lg:w-[380px] lg:border-b-0 lg:border-r"
      >
        <header class="border-b border-line px-5 pb-4 pt-5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="eyebrow">Estación · Domicilios</p>
              <h1 class="mt-1 font-display text-[28px] font-extrabold leading-tight text-ink">
                Domicilios
              </h1>
              <p class="mt-0.5 text-sm text-muted">
                Rutas de entrega y sus conductores en la sucursal activa.
              </p>
            </div>
            <button
              type="button"
              class="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-600 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:opacity-50"
              :disabled="loading"
              @click="load"
            >
              <i class="pi pi-refresh text-[10px]" :class="loading ? 'animate-spin' : ''" /> Actualizar
            </button>
          </div>
        </header>

        <p
          v-if="error"
          role="alert"
          class="mx-5 mt-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ error }}
        </p>
        <p
          v-else-if="!branch.hasActiveBranch && !loading"
          class="mx-5 mt-3 rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
        >
          Esta cuenta aún no tiene sucursales.
        </p>

        <div class="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Rutas</span>
          <label class="flex cursor-pointer items-center gap-1.5">
            <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Solo activas</span>
            <button
              type="button"
              role="switch"
              :aria-checked="onlyActive"
              class="relative h-[18px] w-8 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              :class="onlyActive ? 'bg-ember' : 'bg-steel-300'"
              @click="onlyActive = !onlyActive"
            >
              <span
                class="absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white shadow transition-all"
                :class="onlyActive ? 'left-[16px]' : 'left-[2px]'"
              />
            </button>
          </label>
        </div>

        <div v-if="canManage" class="px-5 pb-3">
          <button
            type="button"
            class="w-full rounded-lg bg-ember px-3 py-2 font-mono text-[12px] font-bold uppercase tracking-wide text-graphite-900 transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            @click="openCreate"
          >
            + Nueva ruta
          </button>
        </div>

        <ul class="flex-1 space-y-2 overflow-y-auto px-5 pb-5">
          <li v-for="route in visibleRoutes" :key="route.id">
            <button
              type="button"
              class="w-full rounded-xl border bg-surface px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              :class="[
                route.id === selectedId
                  ? 'border-2 border-ember bg-ember-50/60'
                  : 'border-line hover:border-ember/50',
                route.isActive ? '' : 'opacity-50',
              ]"
              @click="select(route.id)"
            >
              <div class="flex items-center gap-2.5">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: route.color }" />
                <span class="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{{ route.name }}</span>
                <span class="shrink-0 font-mono text-[10px] font-bold tracking-wide text-steel-400">
                  {{ routeCode(route.name) }}
                </span>
              </div>
              <p class="mt-1 truncate pl-5 font-mono text-[10px] uppercase tracking-wide text-steel-400">
                {{ route.zones.join(', ') || 'Sin zonas' }}
              </p>
            </button>
          </li>
          <li
            v-if="!visibleRoutes.length && !loading"
            class="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12px] text-muted"
          >
            No hay rutas{{ onlyActive ? ' activas' : '' }}. Crea una para empezar a cubrir zonas.
          </li>
        </ul>
      </aside>

      <!-- RIGHT: the coverage map -->
      <main class="relative min-h-0 min-w-0 flex-1">
        <div ref="mapEl" class="absolute inset-0 z-0" />
        <p
          v-if="mapError"
          class="absolute inset-x-0 top-6 z-10 mx-auto w-fit rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 font-mono text-xs text-alert"
          role="alert"
        >
          El mapa no cargó. Revisa la conexión y usa Actualizar.
        </p>

        <!-- Location onboarding / relocation -->
        <div
          v-if="!mapError && (picking || (!center && !loading))"
          class="pointer-events-none absolute inset-x-0 top-4 z-[550] flex justify-center px-4"
        >
          <div
            class="pointer-events-auto flex max-w-md flex-col gap-2 rounded-2xl bg-graphite-900 px-4 py-3 shadow-[0_18px_44px_-18px_rgb(0_0_0/0.6)]"
          >
            <p class="font-mono text-[11px] uppercase tracking-[0.16em] text-ember">
              Ubicación del negocio
            </p>
            <p v-if="canManage" class="text-[13px] leading-snug text-paper/80">
              {{ pendingPin ? 'Pin puesto. Guarda la ubicación o toca otro punto para ajustarla.' : 'Arrastra y acerca el mapa hasta tu ciudad si hace falta, y toca el punto exacto de tu negocio — los anillos de ruta se dibujan desde ahí.' }}
            </p>
            <p v-else class="text-[13px] leading-snug text-paper/80">
              Esta sucursal aún no tiene ubicación. Pide a un administrador que la marque.
            </p>
            <div v-if="canManage" class="flex justify-end gap-2">
              <button
                v-if="center"
                type="button"
                class="rounded-lg px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide text-paper/60 transition hover:bg-white/10 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                @click="cancelPicking"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="rounded-lg bg-ember px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide text-graphite-900 transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:opacity-50"
                :disabled="!pendingPin || savingPin"
                @click="savePin"
              >
                {{ savingPin ? 'Guardando…' : 'Guardar ubicación' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Live deliveries toggle, docked top-right: demand over coverage -->
        <div
          v-if="!mapError"
          class="pointer-events-none absolute right-4 top-4 z-[500] flex flex-col items-end gap-1"
        >
          <button
            type="button"
            class="pointer-events-auto flex items-center gap-1.5 rounded-xl border px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide shadow-[0_10px_28px_-12px_rgb(0_0_0/0.45)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :class="
              showDeliveries
                ? 'border-ember/60 bg-paper text-ember'
                : 'border-line bg-paper text-steel-500 hover:text-ink'
            "
            :aria-pressed="showDeliveries"
            @click="showDeliveries = !showDeliveries"
          >
            Pedidos
            <span
              class="grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
              :class="deliveryOverlay.points.length > 0 ? 'bg-ember text-graphite-900' : 'bg-sunken text-steel-500'"
            >
              {{ deliveryOverlay.points.length }}
            </span>
          </button>
          <span
            v-if="deliveryOverlay.unlocated > 0"
            class="pointer-events-auto rounded-lg bg-paper/90 px-2 py-1 font-mono text-[10px] text-steel-500 shadow"
          >
            {{ deliveryOverlay.unlocated }} sin ubicación
          </span>
        </div>

        <!-- Radius configurator, docked bottom-left (needs a center to mean anything) -->
        <div v-if="center" class="pointer-events-none absolute bottom-4 left-4 z-[500]">
          <RadiusPanel
            v-model:step-km="stepKm"
            v-model:open="radiusOpen"
            :routes="activeRoutes"
            :selected-id="selectedId"
            :readonly="!canManage"
            @select="(id: string) => select(id)"
            @relocate="startPicking"
          />
        </div>

        <!-- Route detail, slides in over the map -->
        <Transition name="route-detail">
          <RouteDetailPanel
            v-if="selectedRoute"
            :route="selectedRoute"
            :ring-index="selectedBand"
            :step-km="stepKm"
            :assigned="assignedDrivers"
            :assignable="assignablePool"
            :can-manage="canManage"
            class="absolute inset-y-0 right-0 z-[600]"
            @close="closeDetail"
            @edit="openEdit(selectedRoute)"
            @toggle-active="toggleActive(selectedRoute)"
            @add-zone="(z: string) => saveZones(selectedRoute!, [...selectedRoute!.zones, z])"
            @remove-zone="(z: string) => saveZones(selectedRoute!, selectedRoute!.zones.filter((x) => x !== z))"
            @assign-driver="(id: string) => assignDriver(selectedRoute!, id)"
            @remove-driver="(id: string) => removeDriver(selectedRoute!, id)"
          />
        </Transition>
      </main>

      <!-- New / edit route modal -->
      <div
        v-if="form.open"
        class="fixed inset-0 z-[700] grid place-items-center bg-black/40 p-6"
        role="dialog"
        aria-modal="true"
        @click.self="closeForm"
      >
        <div class="w-full max-w-sm overflow-hidden rounded-2xl bg-paper shadow-2xl ring-1 ring-black/10">
          <div class="docket-perf h-2 w-full" />
          <div class="flex flex-col gap-4 p-5">
            <h3 class="font-display text-lg font-extrabold text-ink">
              {{ form.editingId ? 'Editar ruta' : 'Nueva ruta' }}
            </h3>

            <div class="flex flex-col gap-1">
              <label for="route-name" class="text-xs text-steel-500">Nombre de ruta</label>
              <input
                id="route-name"
                v-model="form.name"
                placeholder="p. ej. Ruta Laureles"
                maxlength="100"
                class="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="route-zone" class="text-xs text-steel-500">Zonas cubiertas</label>
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="zone in form.zones"
                  :key="zone"
                  class="flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 font-mono text-[11px] text-ink"
                >
                  {{ zone }}
                  <button
                    type="button"
                    :aria-label="`Quitar zona ${zone}`"
                    class="text-steel-500 transition hover:text-alert"
                    @click="form.zones = form.zones.filter((z) => z !== zone)"
                  >
                    <i class="pi pi-times text-[9px]" />
                  </button>
                </span>
              </div>
              <input
                id="route-zone"
                v-model="form.zoneDraft"
                placeholder="Escribe una zona y Enter"
                maxlength="60"
                class="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                @keyup.enter="addFormZone"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-xs text-steel-500">Color de ruta (su anillo en el mapa)</span>
              <div class="flex gap-2">
                <button
                  v-for="color in RING_COLORS"
                  :key="color"
                  type="button"
                  :aria-label="`Color ${color}`"
                  class="h-7 w-7 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                  :class="form.color === color ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'"
                  :style="{ background: color }"
                  @click="form.color = color"
                />
              </div>
              <p class="font-mono text-[10px] text-steel-500">
                El anillo se previsualiza punteado en el mapa.
              </p>
            </div>

            <div class="flex justify-end gap-2 pt-1">
              <button
                type="button"
                class="rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                @click="closeForm"
              >
                Cancelar
              </button>
              <button
                type="button"
                class="rounded-lg bg-ember px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-graphite-900 transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:opacity-50"
                :disabled="form.name.trim() === '' || form.saving"
                @click="saveForm"
              >
                {{ form.saving ? 'Guardando…' : form.editingId ? 'Guardar cambios' : 'Crear ruta' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.route-detail-enter-active,
.route-detail-leave-active {
  transition:
    transform 0.25s cubic-bezier(0.2, 0.7, 0.2, 1),
    opacity 0.2s ease;
}
.route-detail-enter-from,
.route-detail-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .route-detail-enter-active,
  .route-detail-leave-active {
    transition: none;
  }
}
</style>
