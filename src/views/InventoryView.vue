<script setup lang="ts">
// Inventario — the inventory board, wired to real data.
// El Pase board over the real domain: insumos (recipes directory) × branch-scoped
// stock × movements. Signature: the depletion bar — under every stock figure, a
// thin bar with a notch at the minimum, colored by state.
// Permissions span two modules: stock actions need `inventory.adjust`, creating or
// editing insumos needs `recipes.manage`; with `inventory.read` alone it's read-only.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCatalogStore } from '@/stores/catalog'
import { useInventoryStore, type StockRow } from '@/stores/inventory'
import { useStaffStore } from '@/stores/staff'
import { statusOf as httpStatusOf } from '@/lib/apiError'
import type { Employee } from '@/services/staff.api'

const auth = useAuthStore()
const branch = useBranchStore()
const catalog = useCatalogStore()
const inventory = useInventoryStore()
const staff = useStaffStore()

const canAdjust = computed(() => auth.can('inventory.adjust'))
const canWriteRecipes = computed(() => auth.can('recipes.manage'))

// --- Load ----------------------------------------------------------------------
const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    const branchId = branch.activeBranchId
    if (!branchId) return
    await Promise.all([
      inventory.loadBranch(branchId),
      staff.ensureLoaded({ branchId, active: true }),
    ])
  } catch {
    error.value = 'No se pudo cargar el inventario.'
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(
  () => branch.activeBranchId,
  () => {
    openId.value = null
    selected.clear()
    void load()
  },
)

// --- Formatting -------------------------------------------------------------------
const qtyFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 })
function fmtQty(value: string): string {
  return qtyFmt.format(Number(value))
}
function fmtWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const time = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
  const today = new Date()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  if (d.toDateString() === today.toDateString()) return `Hoy ${time}`
  if (d.toDateString() === yesterday.toDateString()) return `Ayer ${time}`
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}
function initial(name: string): string {
  return (name[0] ?? '?').toUpperCase()
}

// --- Status + depletion (the signature) ----------------------------------------------
type StockStatus = 'ok' | 'low' | 'out'
const STATUS_META: Record<StockStatus, { label: string; pill: string; dot: string; bar: string }> = {
  ok: { label: 'En stock', pill: 'pill-success', dot: 'bg-success', bar: 'bg-success' },
  low: { label: 'Stock bajo', pill: 'pill-warn', dot: 'bg-warn', bar: 'bg-warn' },
  out: { label: 'Agotado', pill: 'pill-alert', dot: 'bg-alert', bar: 'bg-alert' },
}
function statusOf(r: StockRow): StockStatus {
  if (r.out) return 'out'
  if (r.low) return 'low'
  return 'ok'
}
/** Fill of the depletion bar: the notch (min) sits at the midpoint. */
function depletionPct(r: StockRow): number {
  const qty = Number(r.stock.current_quantity)
  const min = Number(r.stock.min_stock)
  if (qty <= 0) return 0
  if (min <= 0) return 100
  return Math.min((qty / (min * 2)) * 100, 100)
}

// --- Areas -----------------------------------------------------------------------------
type Area = 'products' | 'alerts'
const area = ref<Area>('products')
const alertCount = computed(() => inventory.rows.filter((r) => r.low || r.out).length)

// --- Filters + sort -----------------------------------------------------------------------
const query = ref('')
const fCategory = ref<string>('all')
const fStock = ref<string>('all')
const categoryOptions = computed(() => [
  { label: 'Todas las categorías', value: 'all' },
  ...inventory.categories.map((c) => ({ label: c, value: c })),
])
const stockOptions = [
  { label: 'Todo el stock', value: 'all' },
  { label: 'En stock', value: 'ok' },
  { label: 'Stock bajo', value: 'low' },
  { label: 'Agotado', value: 'out' },
]

type SortKey = 'name' | 'stock' | 'updated'
const sortKey = ref<SortKey>('name')
const sortAsc = ref(true)
function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = key === 'name'
  }
}
const sortOptions = [
  { label: 'Nombre A–Z', value: 'name-asc' },
  { label: 'Stock ↑', value: 'stock-asc' },
  { label: 'Stock ↓', value: 'stock-desc' },
  { label: 'Última modificación', value: 'updated-desc' },
]
const sortValue = computed({
  get: () => `${sortKey.value}-${sortAsc.value ? 'asc' : 'desc'}`,
  set: (v: string) => {
    const [key, dir] = v.split('-')
    sortKey.value = key as SortKey
    sortAsc.value = dir === 'asc'
  },
})

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = inventory.rows.filter((r) => {
    if (fCategory.value !== 'all' && r.category !== fCategory.value) return false
    if (fStock.value !== 'all' && statusOf(r) !== fStock.value) return false
    if (q && !`${r.name} ${r.category ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
  const dir = sortAsc.value ? 1 : -1
  return [...list].sort((a, b) => {
    switch (sortKey.value) {
      case 'stock':
        return (Number(a.stock.current_quantity) - Number(b.stock.current_quantity)) * dir
      case 'updated':
        return (a.stock.updated_at ?? '').localeCompare(b.stock.updated_at ?? '') * dir
      default:
        return a.name.localeCompare(b.name) * dir
    }
  })
})

interface Chip {
  label: string
  clear: () => void
}
const chips = computed<Chip[]>(() => {
  const list: Chip[] = []
  if (fCategory.value !== 'all')
    list.push({ label: `Categoría: ${fCategory.value}`, clear: () => (fCategory.value = 'all') })
  if (fStock.value !== 'all') {
    const label = stockOptions.find((o) => o.value === fStock.value)?.label ?? fStock.value
    list.push({ label, clear: () => (fStock.value = 'all') })
  }
  return list
})
function clearFilters() {
  fCategory.value = 'all'
  fStock.value = 'all'
  query.value = ''
}

// --- Stats ------------------------------------------------------------------------------------
const stats = computed(() => {
  const rows = inventory.rows
  const total = rows.length
  const out = rows.filter((r) => r.out).length
  const low = rows.filter((r) => r.low && !r.out).length
  const ok = total - out - low
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
  return { total, ok, low, out, okPct: pct(ok), lowPct: pct(low), outPct: pct(out) }
})

// --- View mode + refresh --------------------------------------------------------------------------
const viewMode = ref<'list' | 'cards'>('list')
const refreshing = ref(false)
async function refresh() {
  refreshing.value = true
  try {
    await load()
  } finally {
    refreshing.value = false
  }
}

// --- Selection + CSV export -------------------------------------------------------------------------
const selected = reactive(new Set<string>())
const allSelected = computed(
  () => filtered.value.length > 0 && filtered.value.every((r) => selected.has(r.stock.ingredient_id)),
)
function toggleAll() {
  if (allSelected.value) selected.clear()
  else for (const r of filtered.value) selected.add(r.stock.ingredient_id)
}
function toggleSelect(id: string) {
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
}
function exportCsv(rows: StockRow[]) {
  const head = 'insumo,categoria,unidad,stock,minimo,estado'
  const lines = rows.map((r) =>
    [
      `"${r.name}"`,
      r.category ?? '',
      r.unitAbbr,
      r.stock.current_quantity,
      r.stock.min_stock,
      STATUS_META[statusOf(r)].label,
    ].join(','),
  )
  const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'inventario.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// --- Row menu -----------------------------------------------------------------------------------------
const menuFor = ref<string | null>(null)
function onDocClick() {
  menuFor.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

// --- Detail drawer ---------------------------------------------------------------------------------------
type DrawerTab = 'details' | 'movements' | 'alerts'
const openId = ref<string | null>(null)
const drawerTab = ref<DrawerTab>('details')
const openRow = computed(() => inventory.rows.find((r) => r.stock.ingredient_id === openId.value) ?? null)
const drawerTabs: { value: DrawerTab; label: string }[] = [
  { value: 'details', label: 'Detalles' },
  { value: 'movements', label: 'Movimientos' },
  { value: 'alerts', label: 'Alertas' },
]
function openDetail(r: StockRow, tab: DrawerTab = 'details') {
  openId.value = r.stock.ingredient_id
  drawerTab.value = tab
  menuFor.value = null
  void inventory.selectIngredient(r.stock.ingredient_id)
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && openId.value) openId.value = null
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function employeeName(employeeId: string): string {
  const emp = staff.employees.find((e: Employee) => e.id === employeeId)
  return emp ? staff.employeeName(emp) : `#${employeeId.slice(0, 8)}`
}
const employeeOptions = computed(() =>
  staff.employees
    .filter((e: Employee) => e.is_active)
    .map((e: Employee) => ({ label: staff.employeeName(e), value: e.id })),
)

// --- Threshold editor (drawer Alertas tab) --------------------------------------------------------------------
const thresholdDraft = ref('')
const thresholdSaving = ref(false)
const thresholdSaved = ref(false)
const thresholdError = ref<string | null>(null)
let thresholdTimer: ReturnType<typeof setTimeout> | null = null
watch(openRow, (r, prev) => {
  if (r && r.stock.ingredient_id !== prev?.stock.ingredient_id) {
    thresholdDraft.value = r.stock.min_stock
    thresholdSaved.value = false
    thresholdError.value = null
  }
})
async function saveThreshold() {
  const r = openRow.value
  if (!r || thresholdDraft.value === '' || Number(thresholdDraft.value) < 0) return
  thresholdSaving.value = true
  thresholdError.value = null
  try {
    await inventory.setThreshold(r.stock.ingredient_id, String(thresholdDraft.value))
    thresholdSaved.value = true
    if (thresholdTimer) clearTimeout(thresholdTimer)
    thresholdTimer = setTimeout(() => (thresholdSaved.value = false), 2000)
  } catch {
    thresholdError.value = 'No se pudo guardar el mínimo.'
  } finally {
    thresholdSaving.value = false
  }
}

// --- "Ajustar stock" modal --------------------------------------------------------------------------------------
type MoveType = 'in' | 'out' | 'recount'
const MOVE_TYPES: { value: MoveType; label: string; icon: string }[] = [
  { value: 'in', label: 'Entrada', icon: 'pi-arrow-up' },
  { value: 'out', label: 'Salida', icon: 'pi-arrow-down' },
  { value: 'recount', label: 'Recuento', icon: 'pi-equals' },
]
const REASONS: Record<'in' | 'out', string[]> = {
  in: ['Compra', 'Devolución', 'Stock inicial'],
  out: ['Consumo cocina', 'Desperdicio', 'Venta', 'Ajuste'],
}
const smOpen = ref(false)
const smRowId = ref<string | null>(null)
const smType = ref<MoveType>('in')
const smQty = ref<number | null>(null)
const smReason = ref('Compra')
const smEmployee = ref<string | null>(null)
const smNotes = ref('')
const smSaving = ref(false)
const smError = ref<string | null>(null)
const smRow = computed(() => inventory.rows.find((r) => r.stock.ingredient_id === smRowId.value) ?? null)
const smReasonOptions = computed(() =>
  (REASONS[smType.value === 'recount' ? 'in' : smType.value] ?? []).map((r) => ({ label: r, value: r })),
)
watch(smType, (t) => {
  if (t !== 'recount') smReason.value = REASONS[t][0] ?? ''
})
function openStockModal(r: StockRow, type: MoveType = 'in', reason?: string) {
  smRowId.value = r.stock.ingredient_id
  smType.value = type
  smQty.value = null
  smReason.value = reason ?? (type === 'out' ? 'Consumo cocina' : 'Compra')
  smEmployee.value = employeeOptions.value.length === 1 ? (employeeOptions.value[0]?.value ?? null) : null
  smNotes.value = ''
  smError.value = null
  smOpen.value = true
  menuFor.value = null
}
const smValid = computed(
  () =>
    smQty.value !== null &&
    (smType.value === 'recount' ? smQty.value >= 0 : smQty.value > 0) &&
    smEmployee.value !== null,
)
async function saveMovement() {
  const r = smRow.value
  if (!r || !smValid.value || smQty.value === null || !smEmployee.value) return
  smSaving.value = true
  smError.value = null
  try {
    if (smType.value === 'recount') {
      await inventory.recount({
        ingredient_id: r.stock.ingredient_id,
        employee_id: smEmployee.value,
        counted_quantity: String(smQty.value),
        notes: smNotes.value.trim() || null,
      })
    } else {
      await inventory.registerMovement({
        ingredient_id: r.stock.ingredient_id,
        employee_id: smEmployee.value,
        type: smType.value,
        quantity: String(smQty.value),
        reason: smReason.value,
        notes: smNotes.value.trim() || null,
      })
    }
    smOpen.value = false
  } catch (e) {
    smError.value =
      httpStatusOf(e) === 409 || httpStatusOf(e) === 422
        ? 'No hay suficiente existencia para esa salida.'
        : 'No se pudo guardar el movimiento.'
  } finally {
    smSaving.value = false
  }
}

// --- "Nuevo insumo" modal (2 pasos, también edita nombre/categoría/unidad) -----------------------------------------
const pmOpen = ref(false)
const pmStep = ref<1 | 2>(1)
const pmEditingId = ref<string | null>(null)
const pName = ref('')
const pCategory = ref('')
const pUnitId = ref<string | null>(null)
const pStock = ref<number | null>(null)
const pMin = ref<number | null>(null)
const pEmployee = ref<string | null>(null)
const pmSaving = ref(false)
const pmError = ref<string | null>(null)
const pmPartial = ref<string | null>(null)
const unitOptions = computed(() =>
  catalog.units.map((u) => ({ label: `${u.name} (${u.abbreviation})`, value: u.id })),
)
function openNewInsumo() {
  pmEditingId.value = null
  pmStep.value = 1
  pName.value = ''
  pCategory.value = ''
  pUnitId.value = null
  pStock.value = null
  pMin.value = null
  pEmployee.value = employeeOptions.value.length === 1 ? (employeeOptions.value[0]?.value ?? null) : null
  pmError.value = null
  pmPartial.value = null
  pmOpen.value = true
}
function openEditInsumo(r: StockRow) {
  const info = inventory.ingredientInfo(r.stock.ingredient_id)
  pmEditingId.value = r.stock.ingredient_id
  pmStep.value = 1
  pName.value = r.name
  pCategory.value = r.category ?? ''
  pUnitId.value = info?.unitId ?? null
  pmError.value = null
  pmPartial.value = null
  pmOpen.value = true
  menuFor.value = null
}
const pmStep1Valid = computed(() => pName.value.trim() !== '' && pUnitId.value !== null)
const pmNeedsEmployee = computed(
  () => pStock.value !== null && pStock.value > 0 && pEmployee.value === null,
)
async function saveInsumo() {
  if (!pmStep1Valid.value || !pUnitId.value) return
  pmSaving.value = true
  pmError.value = null
  try {
    if (pmEditingId.value) {
      await inventory.updateInsumo(pmEditingId.value, {
        name: pName.value.trim(),
        category: pCategory.value.trim() || null,
        unit_of_measure_id: pUnitId.value,
      })
      pmOpen.value = false
    } else {
      const result = await inventory.createInsumo({
        name: pName.value.trim(),
        category: pCategory.value.trim() || null,
        unitOfMeasureId: pUnitId.value,
        initialQuantity: pStock.value !== null && pStock.value > 0 ? String(pStock.value) : null,
        minStock: pMin.value !== null && pMin.value >= 0 ? String(pMin.value) : null,
        employeeId: pEmployee.value,
      })
      if (!result.stockOk || !result.thresholdOk) {
        const pending = [
          !result.stockOk ? 'el stock inicial' : null,
          !result.thresholdOk ? 'el mínimo' : null,
        ]
          .filter(Boolean)
          .join(' y ')
        pmPartial.value = `El insumo quedó creado, pero falta ${pending} — complétalo desde su detalle.`
      } else {
        pmOpen.value = false
      }
      const row = inventory.rows.find((r) => r.stock.ingredient_id === result.ingredientId)
      if (row) openDetail(row)
    }
  } catch (e) {
    pmError.value =
      httpStatusOf(e) === 409
        ? 'Ya existe un insumo con ese nombre.'
        : pmEditingId.value
          ? 'No se pudo guardar el insumo.'
          : 'No se pudo crear el insumo.'
  } finally {
    pmSaving.value = false
  }
}

// --- Alerts view ---------------------------------------------------------------------------------------------------
const outRows = computed(() => inventory.rows.filter((r) => r.out))
const lowOnlyRows = computed(() => inventory.rows.filter((r) => r.low && !r.out))
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-[90rem] flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- ── Top bar ─────────────────────────────────────────────────────── -->
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="eyebrow">Estación · Inventario</p>
            <h1 class="mt-1 text-2xl font-extrabold text-ink">Inventario</h1>
            <p class="text-steel-500">Insumos, stock y mínimos de tu restaurante.</p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              label="Actualizar"
              size="small"
              severity="secondary"
              outlined
              icon="pi pi-refresh"
              :loading="refreshing"
              @click="refresh"
            />
            <Button
              label="Exportar"
              size="small"
              severity="secondary"
              outlined
              icon="pi pi-download"
              @click="exportCsv(filtered)"
            />
            <Button
              v-if="canWriteRecipes"
              label="Nuevo insumo"
              size="small"
              icon="pi pi-plus"
              @click="openNewInsumo"
            />
          </div>
        </header>

        <!-- ── Área tabs ────────────────────────────────────────────────────── -->
        <nav class="flex w-fit gap-1 rounded-xl border border-line bg-app p-1">
          <button
            type="button"
            class="rounded-lg px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :class="area === 'products' ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
            @click="area = 'products'"
          >
            Insumos
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :class="area === 'alerts' ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
            @click="area = 'alerts'"
          >
            Alertas
            <span
              class="grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px]"
              :class="area === 'alerts' ? 'bg-graphite-900 text-paper' : alertCount ? 'bg-alert text-paper' : 'bg-sunken text-steel-500'"
            >
              {{ alertCount }}
            </span>
          </button>
        </nav>

        <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ error }}
        </p>
        <div v-if="loading && !inventory.rows.length" class="text-steel-500">Cargando el inventario…</div>

        <!-- ═══════════════════════ INSUMOS ═══════════════════════ -->
        <template v-else-if="area === 'products'">
          <!-- Stats -->
          <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div class="card animate-docket px-4 py-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Total insumos</p>
              <p class="mt-0.5 font-display text-3xl font-bold text-ink">{{ stats.total }}</p>
            </div>
            <div class="card animate-docket px-4 py-3" style="animation-delay: 40ms">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">En stock</p>
              <p class="mt-0.5 font-display text-3xl font-bold text-success-600">
                {{ stats.ok }}
                <span class="font-mono text-xs font-normal text-steel-400">({{ stats.okPct }}%)</span>
              </p>
            </div>
            <div class="card animate-docket px-4 py-3" style="animation-delay: 80ms">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Stock bajo</p>
              <p class="mt-0.5 font-display text-3xl font-bold text-warn-600">
                {{ stats.low }}
                <span class="font-mono text-xs font-normal text-steel-400">({{ stats.lowPct }}%)</span>
              </p>
            </div>
            <div class="card animate-docket px-4 py-3" style="animation-delay: 120ms">
              <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Agotados</p>
              <p class="mt-0.5 font-display text-3xl font-bold text-alert-600">
                {{ stats.out }}
                <span class="font-mono text-xs font-normal text-steel-400">({{ stats.outPct }}%)</span>
              </p>
            </div>
          </div>

          <!-- Toolbar -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="relative">
              <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-steel-400" />
              <input
                v-model="query"
                type="search"
                placeholder="Buscar insumo…"
                class="w-56 rounded-lg border border-line bg-paper py-2 pl-8 pr-3 text-sm text-ink placeholder:text-steel-400"
              />
            </div>
            <Select v-model="fCategory" :options="categoryOptions" option-label="label" option-value="value" size="small" class="w-48" />
            <Select v-model="fStock" :options="stockOptions" option-label="label" option-value="value" size="small" class="w-40" />
            <div class="ml-auto flex items-center gap-2">
              <Select v-model="sortValue" :options="sortOptions" option-label="label" option-value="value" size="small" class="w-48" />
              <div class="flex gap-1 rounded-lg border border-line bg-app p-1">
                <button
                  type="button"
                  aria-label="Vista de lista"
                  class="grid h-7 w-8 place-items-center rounded-md transition"
                  :class="viewMode === 'list' ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
                  @click="viewMode = 'list'"
                >
                  <i class="pi pi-bars text-xs" />
                </button>
                <button
                  type="button"
                  aria-label="Vista de tarjetas"
                  class="grid h-7 w-8 place-items-center rounded-md transition"
                  :class="viewMode === 'cards' ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
                  @click="viewMode = 'cards'"
                >
                  <i class="pi pi-th-large text-xs" />
                </button>
              </div>
            </div>
          </div>

          <!-- Active filter chips -->
          <div v-if="chips.length" class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="chip in chips"
              :key="chip.label"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-ember/30 bg-ember-50 px-3 py-1 font-mono text-[11px] text-ember-600 transition hover:border-ember/60"
              @click="chip.clear()"
            >
              {{ chip.label }}
              <i class="pi pi-times text-[9px]" />
            </button>
            <button
              type="button"
              class="font-mono text-[11px] uppercase tracking-wide text-steel-500 underline-offset-2 hover:text-ink hover:underline"
              @click="clearFilters"
            >
              Limpiar filtros
            </button>
          </div>

          <!-- LIST VIEW -->
          <div v-if="viewMode === 'list'" class="card overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr class="bg-sunken">
                    <th class="w-10 px-3 py-2.5">
                      <button type="button" aria-label="Seleccionar todo" @click="toggleAll">
                        <i
                          class="pi text-sm"
                          :class="allSelected ? 'pi-check-square text-ember-600' : 'pi-stop text-steel-400'"
                        />
                      </button>
                    </th>
                    <th class="px-3 py-2.5 text-left">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition"
                        :class="sortKey === 'name' ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
                        @click="toggleSort('name')"
                      >
                        Insumo
                        <i v-if="sortKey === 'name'" class="pi text-[9px]" :class="sortAsc ? 'pi-arrow-up' : 'pi-arrow-down'" />
                      </button>
                    </th>
                    <th class="px-3 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-steel-500">Categoría</th>
                    <th class="px-3 py-2.5 text-left">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition"
                        :class="sortKey === 'stock' ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
                        @click="toggleSort('stock')"
                      >
                        Stock
                        <i v-if="sortKey === 'stock'" class="pi text-[9px]" :class="sortAsc ? 'pi-arrow-up' : 'pi-arrow-down'" />
                      </button>
                    </th>
                    <th class="px-3 py-2.5 text-right font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-steel-500">Mínimo</th>
                    <th class="px-3 py-2.5 text-left">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition"
                        :class="sortKey === 'updated' ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
                        @click="toggleSort('updated')"
                      >
                        Última mod.
                        <i v-if="sortKey === 'updated'" class="pi text-[9px]" :class="sortAsc ? 'pi-arrow-up' : 'pi-arrow-down'" />
                      </button>
                    </th>
                    <th class="px-3 py-2.5 text-left font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-steel-500">Estado</th>
                    <th class="w-10 px-2 py-2.5" />
                  </tr>
                </thead>

                <!-- Skeleton -->
                <tbody v-if="refreshing">
                  <tr v-for="i in 8" :key="i" class="animate-pulse border-b border-hairline">
                    <td class="px-3 py-4" colspan="8">
                      <div class="flex items-center gap-4">
                        <span class="h-3 w-3 rounded bg-sunken" />
                        <span class="h-3 w-56 rounded bg-sunken" />
                        <span class="h-3 w-24 rounded bg-sunken" />
                        <span class="ml-auto h-3 w-32 rounded bg-sunken" />
                      </div>
                    </td>
                  </tr>
                </tbody>

                <!-- Empty -->
                <tbody v-else-if="!filtered.length">
                  <tr>
                    <td colspan="8" class="px-6 py-14 text-center">
                      <i class="pi pi-inbox text-2xl text-steel-300" />
                      <p class="mt-2 text-sm text-steel-500">No se encontraron insumos con estos filtros.</p>
                      <Button label="Limpiar filtros" size="small" severity="secondary" text class="mt-2" @click="clearFilters" />
                    </td>
                  </tr>
                </tbody>

                <!-- Rows -->
                <tbody v-else>
                  <tr
                    v-for="r in filtered"
                    :key="r.stock.ingredient_id"
                    class="cursor-pointer border-b border-hairline transition-colors duration-100 hover:bg-sunken/60"
                    :class="{
                      'bg-warn/5': statusOf(r) === 'low',
                      'bg-alert/5': statusOf(r) === 'out',
                      'bg-ember-50/60': selected.has(r.stock.ingredient_id),
                    }"
                    @click="openDetail(r)"
                  >
                    <td class="px-3 py-2.5" @click.stop>
                      <button type="button" :aria-label="`Seleccionar ${r.name}`" @click="toggleSelect(r.stock.ingredient_id)">
                        <i
                          class="pi text-sm"
                          :class="selected.has(r.stock.ingredient_id) ? 'pi-check-square text-ember-600' : 'pi-stop text-steel-300'"
                        />
                      </button>
                    </td>
                    <td class="px-3 py-2.5">
                      <span class="flex items-center gap-2.5">
                        <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-graphite-900 font-mono text-[11px] font-semibold text-paper">
                          {{ initial(r.name) }}
                        </span>
                        <span class="truncate font-medium text-ink">{{ r.name }}</span>
                      </span>
                    </td>
                    <td class="px-3 py-2.5 text-muted">{{ r.category ?? '—' }}</td>
                    <td class="px-3 py-2.5">
                      <span class="block font-mono text-sm" :class="{
                        'text-success-600': statusOf(r) === 'ok',
                        'text-warn-600': statusOf(r) === 'low',
                        'text-alert-600': statusOf(r) === 'out',
                      }">
                        {{ fmtQty(r.stock.current_quantity) }} <span class="text-[10px] text-steel-400">{{ r.unitAbbr }}</span>
                      </span>
                      <!-- Signature: depletion bar — notch marks the minimum. -->
                      <span class="relative mt-1 block h-1 w-16 rounded-full bg-sunken">
                        <span
                          class="absolute inset-y-0 left-0 rounded-full"
                          :class="STATUS_META[statusOf(r)].bar"
                          :style="{ width: `${depletionPct(r)}%` }"
                        />
                        <span class="absolute inset-y-[-2px] left-1/2 w-px bg-steel-400" />
                      </span>
                    </td>
                    <td class="px-3 py-2.5 text-right font-mono text-sm text-muted">
                      {{ fmtQty(r.stock.min_stock) }} <span class="text-[10px] text-steel-400">{{ r.unitAbbr }}</span>
                    </td>
                    <td class="px-3 py-2.5 font-mono text-[11px] text-steel-500">{{ fmtWhen(r.stock.updated_at) }}</td>
                    <td class="px-3 py-2.5">
                      <span
                        class="pill"
                        :class="STATUS_META[statusOf(r)].pill"
                        :title="`Stock: ${fmtQty(r.stock.current_quantity)} ${r.unitAbbr} · mínimo ${fmtQty(r.stock.min_stock)} ${r.unitAbbr}`"
                      >
                        {{ STATUS_META[statusOf(r)].label }}
                      </span>
                    </td>
                    <td class="relative px-2 py-2.5" @click.stop>
                      <button
                        type="button"
                        aria-label="Acciones"
                        class="grid h-7 w-7 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink"
                        @click.stop="menuFor = menuFor === r.stock.ingredient_id ? null : r.stock.ingredient_id"
                      >
                        <i class="pi pi-ellipsis-v text-xs" />
                      </button>
                      <div
                        v-if="menuFor === r.stock.ingredient_id"
                        class="card absolute right-2 top-9 z-20 w-44 overflow-hidden py-1 text-left"
                        @click.stop
                      >
                        <button
                          v-if="canWriteRecipes"
                          type="button"
                          class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink transition hover:bg-sunken"
                          @click="openEditInsumo(r)"
                        >
                          <i class="pi pi-pencil text-xs text-steel-500" /> Editar insumo
                        </button>
                        <button type="button" class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink transition hover:bg-sunken" @click="openDetail(r, 'movements')">
                          <i class="pi pi-history text-xs text-steel-500" /> Ver movimientos
                        </button>
                        <button
                          v-if="canAdjust"
                          type="button"
                          class="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-ink transition hover:bg-sunken"
                          @click="openStockModal(r, 'in')"
                        >
                          <i class="pi pi-sliders-v text-xs text-steel-500" /> Ajustar stock
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- CARD VIEW -->
          <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div v-if="!filtered.length" class="col-span-full rounded-xl border border-dashed border-line bg-paper/60 p-10 text-center">
              <i class="pi pi-inbox text-2xl text-steel-300" />
              <p class="mt-2 text-sm text-steel-500">No se encontraron insumos con estos filtros.</p>
              <Button label="Limpiar filtros" size="small" severity="secondary" text class="mt-2" @click="clearFilters" />
            </div>
            <div
              v-for="(r, i) in filtered"
              :key="r.stock.ingredient_id"
              class="card animate-docket cursor-pointer overflow-hidden transition hover:border-steel-400"
              :style="{ animationDelay: `${Math.min(i, 12) * 30}ms` }"
              @click="openDetail(r)"
            >
              <div class="relative grid h-20 place-items-center bg-sunken">
                <span class="grid h-11 w-11 place-items-center rounded-xl bg-graphite-900 font-mono text-base font-semibold text-paper">
                  {{ initial(r.name) }}
                </span>
                <span class="pill absolute right-2 top-2" :class="STATUS_META[statusOf(r)].pill">
                  {{ STATUS_META[statusOf(r)].label }}
                </span>
              </div>
              <div class="flex flex-col gap-1.5 p-3.5">
                <p class="truncate font-medium text-ink">{{ r.name }}</p>
                <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ r.category ?? 'Sin categoría' }}
                </p>
                <div class="mt-1 flex items-baseline justify-between">
                  <span class="font-mono text-sm" :class="{
                    'text-success-600': statusOf(r) === 'ok',
                    'text-warn-600': statusOf(r) === 'low',
                    'text-alert-600': statusOf(r) === 'out',
                  }">
                    {{ fmtQty(r.stock.current_quantity) }} {{ r.unitAbbr }}
                  </span>
                  <span class="font-mono text-xs text-muted">mín. {{ fmtQty(r.stock.min_stock) }}</span>
                </div>
                <span class="relative block h-1 w-full rounded-full bg-sunken">
                  <span
                    class="absolute inset-y-0 left-0 rounded-full"
                    :class="STATUS_META[statusOf(r)].bar"
                    :style="{ width: `${depletionPct(r)}%` }"
                  />
                  <span class="absolute inset-y-[-2px] left-1/2 w-px bg-steel-400" />
                </span>
                <div class="mt-2 flex gap-2" @click.stop>
                  <Button label="Detalle" size="small" severity="secondary" text class="flex-1" @click="openDetail(r)" />
                  <Button
                    v-if="canAdjust"
                    label="Ajustar"
                    size="small"
                    severity="secondary"
                    outlined
                    class="flex-1"
                    @click="openStockModal(r, 'in')"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ═══════════════════════ ALERTAS ═══════════════════════ -->
        <template v-else>
          <div class="flex flex-col gap-6">
            <!-- Agotados -->
            <section>
              <h2 class="eyebrow">Agotados · {{ outRows.length }}</h2>
              <p v-if="!outRows.length" class="mt-2 rounded-lg bg-sunken px-3 py-2 text-sm text-muted">Nada agotado. La despensa respira.</p>
              <ul v-else class="mt-2 flex flex-col gap-2">
                <li v-for="r in outRows" :key="r.stock.ingredient_id">
                  <div class="card flex items-center gap-3 border-l-4 border-l-alert px-4 py-3">
                    <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-graphite-900 font-mono text-xs font-semibold text-paper">{{ initial(r.name) }}</span>
                    <button type="button" class="min-w-0 flex-1 text-left" @click="openDetail(r)">
                      <span class="block truncate text-sm font-medium text-ink">{{ r.name }}</span>
                      <span class="block font-mono text-[10px] text-steel-500">
                        {{ r.category ?? 'Sin categoría' }} · última salida {{ fmtWhen(r.stock.updated_at) }}
                      </span>
                    </button>
                    <Button
                      v-if="canAdjust"
                      label="Registrar entrada"
                      size="small"
                      icon="pi pi-cart-plus"
                      @click="openStockModal(r, 'in', 'Compra')"
                    />
                  </div>
                </li>
              </ul>
            </section>

            <!-- Stock bajo -->
            <section>
              <h2 class="eyebrow">Stock bajo · {{ lowOnlyRows.length }}</h2>
              <p v-if="!lowOnlyRows.length" class="mt-2 rounded-lg bg-sunken px-3 py-2 text-sm text-muted">Ningún insumo por debajo del mínimo.</p>
              <ul v-else class="mt-2 flex flex-col gap-2">
                <li v-for="r in lowOnlyRows" :key="r.stock.ingredient_id">
                  <div class="card flex items-center gap-3 border-l-4 border-l-warn px-4 py-3">
                    <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-graphite-900 font-mono text-xs font-semibold text-paper">{{ initial(r.name) }}</span>
                    <button type="button" class="min-w-0 flex-1 text-left" @click="openDetail(r)">
                      <span class="block truncate text-sm font-medium text-ink">{{ r.name }}</span>
                      <span class="mt-0.5 flex items-center gap-2">
                        <span class="font-mono text-[10px] text-steel-500">
                          {{ fmtQty(r.stock.current_quantity) }} de mín. {{ fmtQty(r.stock.min_stock) }} {{ r.unitAbbr }}
                        </span>
                        <span class="relative block h-1 w-20 rounded-full bg-sunken">
                          <span class="absolute inset-y-0 left-0 rounded-full bg-warn" :style="{ width: `${depletionPct(r)}%` }" />
                          <span class="absolute inset-y-[-2px] left-1/2 w-px bg-steel-400" />
                        </span>
                      </span>
                    </button>
                    <Button
                      v-if="canAdjust"
                      label="Registrar entrada"
                      size="small"
                      severity="secondary"
                      outlined
                      @click="openStockModal(r, 'in', 'Compra')"
                    />
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </template>
      </div>

      <!-- Bulk action bar -->
      <Transition name="detail">
        <div
          v-if="selected.size > 0"
          class="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[94vw] items-center gap-3 rounded-xl border border-line bg-graphite-900 px-4 py-2.5 shadow-2xl"
        >
          <span class="font-mono text-[11px] uppercase tracking-wide text-steel-300">
            {{ selected.size }} seleccionados
          </span>
          <Button
            label="Exportar selección"
            size="small"
            severity="secondary"
            outlined
            @click="exportCsv(inventory.rows.filter((r) => selected.has(r.stock.ingredient_id)))"
          />
          <button type="button" aria-label="Deseleccionar" class="grid h-7 w-7 place-items-center rounded-lg text-steel-300 transition hover:text-paper" @click="selected.clear()">
            <i class="pi pi-times text-xs" />
          </button>
        </div>
      </Transition>
    </main>

    <!-- ── Detail drawer ──────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="openRow" class="fixed inset-0 z-40 bg-graphite-900/30" @click="openId = null" />
      <Transition name="detail">
        <aside
          v-if="openRow"
          class="fixed inset-y-0 right-0 z-50 flex w-full max-w-[26rem] flex-col border-l border-line bg-paper shadow-2xl"
        >
          <!-- Header -->
          <div class="border-b border-hairline p-5">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="truncate font-display text-xl font-bold text-ink">{{ openRow.name }}</h2>
                <p class="font-mono text-[11px] text-steel-500">{{ openRow.category ?? 'Sin categoría' }}</p>
              </div>
              <div class="flex items-center gap-1">
                <Button
                  v-if="canWriteRecipes"
                  icon="pi pi-pencil"
                  size="small"
                  severity="secondary"
                  text
                  aria-label="Editar insumo"
                  @click="openEditInsumo(openRow)"
                />
                <Button icon="pi pi-times" size="small" severity="secondary" text aria-label="Cerrar" @click="openId = null" />
              </div>
            </div>
            <div class="mt-2">
              <span class="pill" :class="STATUS_META[statusOf(openRow)].pill">{{ STATUS_META[statusOf(openRow)].label }}</span>
            </div>
            <nav class="mt-3 flex gap-1 rounded-lg border border-line bg-app p-0.5">
              <button
                v-for="t in drawerTabs"
                :key="t.value"
                type="button"
                class="flex-1 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition"
                :class="drawerTab === t.value ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
                @click="drawerTab = t.value"
              >
                {{ t.label }}
              </button>
            </nav>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-5">
            <!-- Detalles -->
            <template v-if="drawerTab === 'details'">
              <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Categoría</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ openRow.category ?? '—' }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Unidad</dt>
                  <dd class="mt-0.5 text-sm text-ink">{{ openRow.unitAbbr || '—' }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Stock actual</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">{{ fmtQty(openRow.stock.current_quantity) }} {{ openRow.unitAbbr }}</dd>
                </div>
                <div>
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Stock mínimo</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">{{ fmtQty(openRow.stock.min_stock) }} {{ openRow.unitAbbr }}</dd>
                </div>
                <div class="col-span-2">
                  <dt class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Última modificación</dt>
                  <dd class="mt-0.5 font-mono text-sm text-ink">{{ fmtWhen(openRow.stock.updated_at) }}</dd>
                </div>
              </dl>

              <h3 class="mt-6 eyebrow">Stock actual vs mínimo</h3>
              <div class="relative mt-2.5 h-2 rounded-full bg-sunken">
                <span
                  class="absolute inset-y-0 left-0 rounded-full"
                  :class="STATUS_META[statusOf(openRow)].bar"
                  :style="{ width: `${depletionPct(openRow)}%` }"
                />
                <span class="absolute inset-y-[-3px] left-1/2 w-px bg-steel-500" title="Stock mínimo" />
              </div>
              <p class="mt-1.5 font-mono text-[11px] text-steel-500">
                {{ fmtQty(openRow.stock.current_quantity) }} {{ openRow.unitAbbr }} · la muesca marca el mínimo
                ({{ fmtQty(openRow.stock.min_stock) }} {{ openRow.unitAbbr }})
              </p>
            </template>

            <!-- Movimientos -->
            <template v-else-if="drawerTab === 'movements'">
              <p v-if="!inventory.movements.length" class="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
                Sin movimientos registrados.
              </p>
              <ol v-else class="flex flex-col gap-2.5">
                <li v-for="m in inventory.movements" :key="m.id" class="flex items-center gap-3">
                  <span
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-full"
                    :class="m.type === 'in' ? 'bg-success/10 text-success-600' : m.type === 'out' ? 'bg-alert/10 text-alert-600' : 'bg-sunken text-steel-500'"
                  >
                    <i class="pi text-[10px]" :class="m.type === 'in' ? 'pi-arrow-up' : m.type === 'out' ? 'pi-arrow-down' : 'pi-equals'" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm text-ink">
                      <span class="font-mono" :class="m.type === 'in' ? 'text-success-600' : m.type === 'out' ? 'text-alert-600' : 'text-steel-500'">
                        {{ m.type === 'in' ? '+' : m.type === 'out' ? '−' : '=' }}{{ fmtQty(m.quantity) }} {{ openRow.unitAbbr }}
                      </span>
                      · {{ m.reason }}<template v-if="m.notes"> — {{ m.notes }}</template>
                    </span>
                    <span class="block font-mono text-[10px] text-steel-500">
                      {{ fmtWhen(m.created_at) }} · {{ employeeName(m.employee_id) }}
                    </span>
                  </span>
                </li>
              </ol>
            </template>

            <!-- Alertas (umbral) -->
            <template v-else>
              <div class="flex flex-col gap-4">
                <div>
                  <p class="text-sm font-medium text-ink">Stock mínimo</p>
                  <p class="text-xs text-muted">
                    Bajo este umbral el insumo aparece en Alertas y se marca en la lista.
                  </p>
                </div>
                <label class="flex items-center justify-between gap-3 text-sm text-muted">
                  Mínimo ({{ openRow.unitAbbr }})
                  <input
                    v-model="thresholdDraft"
                    type="number"
                    min="0"
                    step="any"
                    :disabled="!canAdjust"
                    class="w-28 rounded-lg border border-line bg-paper px-3 py-1.5 text-right font-mono text-sm text-ink disabled:opacity-50"
                  />
                </label>
                <div v-if="canAdjust" class="flex items-center gap-2">
                  <Button
                    label="Guardar mínimo"
                    size="small"
                    severity="secondary"
                    outlined
                    :loading="thresholdSaving"
                    @click="saveThreshold"
                  />
                  <span v-if="thresholdSaved" class="font-mono text-[11px] text-success-600">Mínimo guardado</span>
                </div>
                <p v-if="thresholdError" role="alert" class="font-mono text-xs text-alert">{{ thresholdError }}</p>
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div v-if="canAdjust" class="flex gap-2 border-t border-hairline p-4">
            <Button label="Ajustar stock" icon="pi pi-sliders-v" size="small" class="flex-1" @click="openStockModal(openRow, 'in')" />
            <Button
              label="Recuento"
              icon="pi pi-equals"
              size="small"
              severity="secondary"
              outlined
              class="flex-1"
              @click="openStockModal(openRow, 'recount')"
            />
          </div>
        </aside>
      </Transition>
    </Teleport>

    <!-- ── "Ajustar stock" modal ─────────────────────────────────────────────── -->
    <Dialog
      v-model:visible="smOpen"
      modal
      header="Ajustar stock"
      :style="{ width: '24rem' }"
      :breakpoints="{ '480px': '94vw' }"
    >
      <div v-if="smRow" class="flex flex-col gap-4 pt-1">
        <p class="text-sm text-muted">
          {{ smRow.name }} ·
          <span class="font-mono text-ink">{{ fmtQty(smRow.stock.current_quantity) }} {{ smRow.unitAbbr }}</span> actuales
        </p>
        <div class="flex gap-1 rounded-xl border border-line bg-app p-1">
          <button
            v-for="t in MOVE_TYPES"
            :key="t.value"
            type="button"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 font-mono text-[11px] uppercase tracking-wide transition"
            :class="smType === t.value ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
            @click="smType = t.value"
          >
            <i class="pi text-[10px]" :class="t.icon" />
            {{ t.label }}
          </button>
        </div>
        <p v-if="smType === 'recount'" class="rounded-lg bg-sunken px-3 py-2 text-xs text-muted">
          El recuento fija la existencia contada; la diferencia queda como ajuste en el historial.
        </p>
        <div class="flex items-center justify-center gap-2">
          <input
            v-model.number="smQty"
            type="number"
            min="0"
            step="any"
            placeholder="0"
            class="w-32 rounded-lg border border-line bg-paper px-3 py-2 text-center font-display text-2xl font-bold text-ink placeholder:text-steel-300"
          />
          <span class="font-mono text-sm text-steel-500">{{ smRow.unitAbbr }}</span>
        </div>
        <div v-if="smType !== 'recount'" class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Concepto</label>
          <Select v-model="smReason" :options="smReasonOptions" option-label="label" option-value="value" size="small" fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Registrado por</label>
          <Select
            v-model="smEmployee"
            :options="employeeOptions"
            option-label="label"
            option-value="value"
            placeholder="Elige un empleado"
            size="small"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="sm-notes" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Notas (opcional)</label>
          <textarea
            id="sm-notes"
            v-model="smNotes"
            rows="2"
            class="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </div>
        <p v-if="smError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ smError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text size="small" @click="smOpen = false" />
        <Button label="Guardar movimiento" size="small" :disabled="!smValid" :loading="smSaving" @click="saveMovement" />
      </template>
    </Dialog>

    <!-- ── "Nuevo insumo" modal (2 pasos) ────────────────────────────────────── -->
    <Dialog
      v-model:visible="pmOpen"
      modal
      :header="pmEditingId ? 'Editar insumo' : 'Nuevo insumo'"
      :style="{ width: '28rem' }"
      :breakpoints="{ '520px': '94vw' }"
    >
      <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
        <template v-if="pmEditingId">Información básica</template>
        <template v-else>Paso {{ pmStep }} / 2 · {{ pmStep === 1 ? 'Información básica' : 'Stock y mínimo' }}</template>
      </p>

      <div v-if="pmStep === 1" class="mt-3 flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <label for="pm-name" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Nombre del insumo *</label>
          <input id="pm-name" v-model="pName" type="text" placeholder="Tomate chonto" class="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1.5">
            <label for="pm-category" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Categoría</label>
            <input
              id="pm-category"
              v-model="pCategory"
              type="text"
              list="pm-category-suggestions"
              placeholder="Verduras"
              maxlength="50"
              class="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-steel-400"
            />
            <datalist id="pm-category-suggestions">
              <option v-for="c in inventory.categories" :key="c" :value="c" />
            </datalist>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Unidad de medida *</label>
            <Select v-model="pUnitId" :options="unitOptions" option-label="label" option-value="value" placeholder="Elige" size="small" fluid />
          </div>
        </div>
      </div>

      <div v-else class="mt-3 flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1.5">
            <label for="pm-stock" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Stock inicial</label>
            <input id="pm-stock" v-model.number="pStock" type="number" min="0" step="any" class="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="pm-min" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Stock mínimo</label>
            <input id="pm-min" v-model.number="pMin" type="number" min="0" step="any" class="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink" />
          </div>
        </div>
        <div v-if="pStock !== null && pStock > 0" class="flex flex-col gap-1.5">
          <label class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">Registrado por *</label>
          <Select
            v-model="pEmployee"
            :options="employeeOptions"
            option-label="label"
            option-value="value"
            placeholder="Elige un empleado"
            size="small"
            fluid
          />
          <p class="text-xs text-muted">El stock inicial se registra como una entrada a su nombre.</p>
        </div>
        <p v-if="pmPartial" class="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn-600">
          {{ pmPartial }}
        </p>
      </div>

      <p v-if="pmError" role="alert" class="mt-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ pmError }}
      </p>

      <template #footer>
        <Button
          v-if="pmStep === 2 && !pmEditingId"
          label="Atrás"
          severity="secondary"
          text
          size="small"
          @click="pmStep = 1"
        />
        <Button v-else label="Cancelar" severity="secondary" text size="small" @click="pmOpen = false" />
        <Button
          v-if="pmStep === 1 && !pmEditingId"
          label="Siguiente"
          icon="pi pi-arrow-right"
          icon-pos="right"
          size="small"
          :disabled="!pmStep1Valid"
          @click="pmStep = 2"
        />
        <Button
          v-else
          :label="pmEditingId ? 'Guardar cambios' : 'Guardar insumo'"
          size="small"
          :disabled="!pmStep1Valid || pmNeedsEmployee"
          :loading="pmSaving"
          @click="saveInsumo"
        />
      </template>
    </Dialog>
  </AppShell>
</template>
