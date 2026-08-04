<script setup lang="ts">
// The hero: a sellable variant as a "ficha técnica" — its price line, then the recipe as a
// mono formula (each line a receipt row), the food-cost meter, and a permanently-visible
// "agregar insumo" bench at the bottom. Everything reads/writes through the menu store: recipe
// lines are real BOM items (ingredient_id + unit), the meter is fed by the moving-average
// ingredient unit cost, and activation honors the stock guard (a variant sells only with a recipe).
import { computed, onMounted, ref, watch } from 'vue'
import FoodCostMeter from './FoodCostMeter.vue'
import { useKitchenStore } from '@/stores/kitchen'
import { useMenuStore } from '@/stores/menu'
import { useCatalogStore } from '@/stores/catalog'
import { qty, money } from '@/lib/menuCosting'
import { detailOf, statusOf } from '@/lib/apiError'
import type { ProductVariant } from '@/services/menu.api'
import type { RecipeItem } from '@/services/recipes.api'

const props = defineProps<{
  productId: string
  variant: ProductVariant
  basePrice: number | null
  canRemove: boolean
}>()
const emit = defineEmits<{ remove: []; 'create-insumo': [] }>()

const menu = useMenuStore()
// Las estaciones de la sede, para el override por línea. Ya vienen cargadas por el panel de
// estaciones del mismo editor; aquí sólo se leen.
const kitchen = useKitchenStore()
const catalog = useCatalogStore()

const error = ref<string | null>(null)

// --- Identity + price ------------------------------------------------------
const name = ref(props.variant.name ?? '')
watch(
  () => props.variant.name,
  (n) => {
    name.value = n ?? ''
  },
)
const extra = computed(() => Number(props.variant.extra_price))
const price = computed(() => (props.basePrice ?? 0) + extra.value)

async function renameOnBlur() {
  const next = name.value.trim()
  if (next === (props.variant.name ?? '')) return
  error.value = null
  try {
    await menu.renameVariant(props.productId, props.variant.id, next)
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo renombrar la variante.'
    name.value = props.variant.name ?? ''
  }
}

// --- Recipe (BOM) ----------------------------------------------------------
const items = computed<RecipeItem[]>(() => menu.recipeItemsByVariantId[props.variant.id] ?? [])
const cost = computed(() => menu.recipeCost(props.variant.id))
const hasRecipe = computed(() => items.value.length > 0)

onMounted(() => {
  if (menu.recipeItemsByVariantId[props.variant.id] === undefined) {
    menu.loadRecipeItems(props.variant.id).catch(() => {
      /* the meter shows a partial/empty state on failure */
    })
  }
})

function ingredientLabel(id: string): string {
  return menu.ingredientName(id) ?? '—'
}
function unitAbbr(unitId: string): string {
  return catalog.units.find((u) => u.id === unitId)?.abbreviation ?? ''
}
function lineCost(it: RecipeItem): number | null {
  const unitCost = menu.unitCostOf(it.ingredient_id)
  return unitCost === null ? null : Number(it.quantity) * unitCost
}

async function saveLineQty(it: RecipeItem, raw: string) {
  const q = raw.trim()
  if (q === '' || Number(q) <= 0 || q === String(Number(it.quantity))) return
  error.value = null
  try {
    await menu.updateRecipeItem(props.variant.id, it.id, { quantity: q })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo actualizar la cantidad.'
  }
}
async function saveLineUnit(it: RecipeItem, unitId: string) {
  if (unitId === it.unit_of_measure_id) return
  error.value = null
  try {
    await menu.updateRecipeItem(props.variant.id, it.id, { unit_of_measure_id: unitId })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo actualizar la unidad.'
  }
}
/** Vacío vuelve al default del insumo; una estación fija el override para este plato. */
async function saveLineStation(it: RecipeItem, stationId: string) {
  const next = stationId || null
  if (next === it.station_id) return
  error.value = null
  try {
    await menu.updateRecipeItem(props.variant.id, it.id, { station_id: next })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo cambiar la estación de la línea.'
  }
}
async function removeLine(it: RecipeItem) {
  error.value = null
  try {
    await menu.removeRecipeItem(props.variant.id, it.id)
  } catch (e) {
    error.value =
      statusOf(e) === 422
        ? (detailOf(e) ?? 'Desactiva la variante antes de quitar su última receta.')
        : 'No se pudo quitar el insumo.'
  }
}

// --- Add-insumo bench ------------------------------------------------------
const pickId = ref<string | null>(null)
const amount = ref<number | null>(null)
const unitId = ref<string | null>(null)
const adding = ref(false)
const justAdded = ref<string | null>(null)

const ingredientOptions = computed(() => menu.ingredients)
const canAdd = computed(
  () => pickId.value !== null && amount.value != null && amount.value > 0 && unitId.value !== null,
)

// Default the line's unit to the chosen insumo's own unit (no conversion by default).
function onPickIngredient() {
  const ing = menu.ingredients.find((i) => i.id === pickId.value)
  if (ing) unitId.value = ing.unit_of_measure_id
}
async function submitLine() {
  if (!canAdd.value || pickId.value === null || amount.value == null || unitId.value === null) return
  adding.value = true
  error.value = null
  try {
    const item = await menu.addRecipeItem(props.variant.id, {
      ingredient_id: pickId.value,
      quantity: String(amount.value),
      unit_of_measure_id: unitId.value,
    })
    justAdded.value = item.id
    setTimeout(() => (justAdded.value = null), 900)
    pickId.value = null
    amount.value = null
    unitId.value = null
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo agregar el insumo.'
  } finally {
    adding.value = false
  }
}

// --- Activation (stock guard) ----------------------------------------------
const toggling = ref(false)
async function toggleActive() {
  error.value = null
  if (!props.variant.is_active && !hasRecipe.value) {
    error.value = 'Registra la receta antes de ponerla a la venta.'
    return
  }
  toggling.value = true
  try {
    await menu.setVariantActive(props.productId, props.variant.id, !props.variant.is_active)
  } catch (e) {
    error.value =
      statusOf(e) === 422
        ? (detailOf(e) ?? 'Registra la receta antes de ponerla a la venta.')
        : 'No se pudo actualizar la variante.'
  } finally {
    toggling.value = false
  }
}

// --- "Producto 1:1" — a can/bottle whose recipe is itself ------------------
const BASE_UNIT_TOKENS = ['und', 'unidad', 'unidades', 'un', 'u']
const linking11 = ref(false)
function resolveBaseUnitId(): string | null {
  const match = catalog.units.find(
    (u) =>
      BASE_UNIT_TOKENS.includes(u.abbreviation.trim().toLowerCase()) ||
      BASE_UNIT_TOKENS.includes(u.name.trim().toLowerCase()),
  )
  return match?.id ?? catalog.baseUnits[0]?.id ?? catalog.units[0]?.id ?? null
}
async function makeOneToOne() {
  linking11.value = true
  error.value = null
  try {
    const target = (name.value.trim() || props.variant.name || 'Producto').trim()
    let ing = menu.ingredients.find((i) => i.name.trim().toLowerCase() === target.toLowerCase())
    if (!ing) {
      const uid = resolveBaseUnitId()
      if (!uid) {
        error.value = 'No hay unidades de medida configuradas para el insumo base.'
        return
      }
      ing = await menu.createIngredient({ name: target, unit_of_measure_id: uid })
    }
    await menu.addRecipeItem(props.variant.id, {
      ingredient_id: ing.id,
      quantity: '1',
      unit_of_measure_id: ing.unit_of_measure_id,
    })
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo crear la receta 1:1.'
  } finally {
    linking11.value = false
  }
}
</script>

<template>
  <article class="card overflow-hidden">
    <div class="docket-perf h-[6px] w-full" />
    <div class="flex flex-col gap-4 p-5">
      <!-- Variant identity + price -->
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap items-end gap-3">
          <label class="block">
            <span class="eyebrow">Variante</span>
            <input
              v-model="name"
              class="mt-1 block w-40 rounded-lg border border-line bg-surface px-3 py-1.5 font-display text-base font-semibold text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
              @blur="renameOnBlur"
              @keyup.enter="renameOnBlur"
            />
          </label>
          <div class="pb-1">
            <span class="eyebrow">Extra</span>
            <p class="mt-1 font-mono text-sm tabular-nums text-steel-600">+{{ money(extra) }}</p>
          </div>
          <div class="pb-1">
            <span class="eyebrow">Precio final</span>
            <p class="mt-1 font-mono text-lg font-bold tabular-nums text-ink">
              {{ basePrice === null ? 'Sin precio' : money(price) }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="pill"
            :class="variant.is_active ? 'pill-success' : 'pill-neutral'"
            :disabled="toggling"
            @click="toggleActive"
          >
            <span class="size-1.5 rounded-full" :class="variant.is_active ? 'bg-success' : 'bg-steel-400'" />
            {{ variant.is_active ? 'En venta' : 'Oculta' }}
          </button>
          <button
            v-if="canRemove"
            type="button"
            class="grid size-8 place-items-center rounded-lg text-steel-400 transition hover:bg-alert/8 hover:text-alert-600"
            aria-label="Eliminar variante"
            @click="emit('remove')"
          >
            <i class="pi pi-trash text-sm" />
          </button>
        </div>
      </header>

      <p v-if="error" role="alert" class="rounded-lg bg-alert/8 px-3 py-1.5 font-mono text-[11px] text-alert-600">{{ error }}</p>

      <!-- Recipe formula -->
      <section class="rounded-xl bg-sunken/50 p-4">
        <div class="mb-3 flex items-baseline justify-between gap-2">
          <p class="eyebrow">Receta — descuenta del inventario al vender</p>
          <p class="font-mono text-[11px] tabular-nums text-steel-500">{{ items.length }} insumos</p>
        </div>

        <!-- Empty state: a variant with no recipe can't be sold -->
        <div
          v-if="!items.length"
          class="rounded-xl border border-dashed border-warn/40 bg-warn/8 p-5 text-center"
        >
          <i class="pi pi-inbox text-lg text-warn-600" />
          <p class="mt-1.5 text-sm font-medium text-ink">Sin receta, no se puede vender</p>
          <p class="mt-0.5 font-mono text-[11px] text-steel-500">Añade los insumos abajo, o usa Producto 1:1 para una lata o botella.</p>
        </div>

        <!-- Formula lines -->
        <ul v-else class="flex flex-col divide-y divide-hairline overflow-hidden rounded-lg border border-line bg-surface">
          <li class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 bg-sunken/60 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-steel-500">
            <span>Insumo</span><span class="text-right">Cantidad</span><span class="text-right">Costo</span><span></span>
          </li>
          <li
            v-for="it in items"
            :key="it.id"
            class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 transition-colors"
            :class="justAdded === it.id ? 'flash-line' : 'hover:bg-sunken/40'"
          >
            <span class="truncate text-[13px] text-ink">{{ ingredientLabel(it.ingredient_id) }}</span>
            <span class="flex items-center gap-1">
              <input
                :value="Number(it.quantity)"
                type="number"
                step="0.001"
                min="0"
                class="w-20 rounded-md border border-line bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
                @focus="($event.target as HTMLInputElement).select()"
                @change="saveLineQty(it, ($event.target as HTMLInputElement).value)"
              />
              <select
                :value="it.unit_of_measure_id"
                class="w-16 rounded-md border border-line bg-surface py-1 pl-1.5 font-mono text-[11px] text-steel-600 outline-none"
                @change="saveLineUnit(it, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="u in catalog.units" :key="u.id" :value="u.id">{{ u.abbreviation }}</option>
              </select>
              <!-- Dónde se trabaja ESTE insumo en ESTE plato. Vacío = el default del insumo, que
                   cubre el caso normal; el override existe para el arroz que aquí se fríe. -->
              <select
                :value="it.station_id ?? ''"
                class="w-24 rounded-md border border-line bg-surface py-1 pl-1.5 font-mono text-[11px] text-steel-600 outline-none"
                :title="`Estación de ${ingredientLabel(it.ingredient_id)} en este plato`"
                data-line-station
                @change="saveLineStation(it, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">por defecto</option>
                <option v-for="s in kitchen.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </span>
            <span class="w-16 text-right font-mono text-[12px] tabular-nums text-steel-500">{{ lineCost(it) === null ? '—' : money(lineCost(it) as number) }}</span>
            <button
              type="button"
              class="grid size-7 place-items-center rounded-md text-steel-400 transition hover:bg-alert/8 hover:text-alert-600"
              :title="`Quitar ${ingredientLabel(it.ingredient_id)}`"
              @click="removeLine(it)"
            >
              <i class="pi pi-times text-[11px]" />
            </button>
          </li>
        </ul>

        <!-- Receipt-tape summary of what one sale deducts -->
        <p v-if="items.length" class="mt-3 font-mono text-[11px] leading-relaxed text-steel-500">
          <i class="pi pi-box text-[10px] text-steel-400" /> Al vender 1 →
          <span v-for="(it, i) in items" :key="it.id" class="text-ink">
            {{ qty(Number(it.quantity)) }} {{ unitAbbr(it.unit_of_measure_id) }} {{ ingredientLabel(it.ingredient_id) }}<span v-if="i < items.length - 1" class="text-steel-300"> · </span>
          </span>
        </p>

        <!-- Add-insumo bench: always visible at the bottom -->
        <div class="mt-4 flex flex-wrap items-end gap-2 border-t border-dashed border-line pt-3">
          <label class="min-w-[10rem] flex-1">
            <span class="eyebrow">Insumo</span>
            <select
              v-model="pickId"
              class="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20"
              @change="onPickIngredient"
            >
              <option :value="null" disabled>Elige un insumo…</option>
              <option v-for="i in ingredientOptions" :key="i.id" :value="i.id">{{ i.name }}</option>
            </select>
          </label>
          <label class="w-24">
            <span class="eyebrow">Cantidad</span>
            <input v-model.number="amount" type="number" step="0.001" min="0" placeholder="0.000" class="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 text-right font-mono text-sm tabular-nums text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20" @keyup.enter="submitLine" />
          </label>
          <label class="w-24">
            <span class="eyebrow">Unidad</span>
            <select v-model="unitId" class="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2 font-mono text-[12px] text-steel-600 outline-none">
              <option :value="null" disabled>—</option>
              <option v-for="u in catalog.units" :key="u.id" :value="u.id">{{ u.abbreviation }}</option>
            </select>
          </label>
          <button
            type="button"
            :disabled="!canAdd || adding"
            class="h-9 rounded-lg bg-ember px-4 text-sm font-semibold text-white transition hover:bg-ember-600 disabled:opacity-40"
            @click="submitLine"
          >
            Añadir
          </button>
        </div>
        <div class="mt-2 flex gap-3">
          <button type="button" class="font-mono text-[11px] text-ember-600 hover:underline" @click="emit('create-insumo')">
            <i class="pi pi-plus-circle text-[10px]" /> Crear insumo nuevo
          </button>
          <button type="button" :disabled="linking11" class="font-mono text-[11px] text-steel-600 hover:text-ink disabled:opacity-40" @click="makeOneToOne">
            <i class="pi pi-bolt text-[10px]" /> Producto 1:1
          </button>
        </div>
      </section>

      <!-- The economics — the one colored signal -->
      <FoodCostMeter
        :cost="cost.total"
        :price="price"
        :margin="price - cost.total"
        :partial="cost.partial || basePrice === null"
      />
    </div>
  </article>
</template>

<style scoped>
@keyframes flash-line {
  from { background-color: color-mix(in oklab, var(--color-success) 20%, transparent); }
  to { background-color: transparent; }
}
.flash-line { animation: flash-line 0.9s ease-out both; }
@media (prefers-reduced-motion: reduce) { .flash-line { animation: none; } }
</style>
