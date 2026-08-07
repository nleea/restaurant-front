<script setup lang="ts">
// Create an inventory insumo (ingredient) without leaving the recipe bench, then hand its
// id back to be used in the current recipe. Real ingredients have NO cost input — cost is
// derived from purchases (moving-average), so a brand-new insumo is "sin costo" until a
// purchase exists. Fields are just name + unit of measure (from the catalog).
import { computed, onMounted, ref } from 'vue'
import { useMenuStore } from '@/stores/menu'
import { useCatalogStore } from '@/stores/catalog'
import { detailOf } from '@/lib/apiError'

const emit = defineEmits<{ close: []; created: [string] }>()

const menu = useMenuStore()
const catalog = useCatalogStore()

const name = ref('')
const unitId = ref<string | null>(null)
// Whether a customer may exclude this insumo from a dish ("sin cebolla"). Staples (sal, aceite)
// should be off so they never appear in the public "quitar ingredientes" list. Default on.
const customerRemovable = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)

const unitOptions = computed(() => catalog.units)
const valid = computed(() => name.value.trim() !== '' && unitId.value !== null)

onMounted(async () => {
  if (!catalog.units.length) {
    try {
      await catalog.fetchUnits()
    } catch {
      error.value = 'No se pudieron cargar las unidades.'
    }
  }
  unitId.value = catalog.baseUnits[0]?.id ?? catalog.units[0]?.id ?? null
})

async function submit() {
  if (!valid.value || !unitId.value || saving.value) return
  saving.value = true
  error.value = null
  try {
    const ingredient = await menu.createIngredient({
      name: name.value.trim(),
      unit_of_measure_id: unitId.value,
      is_customer_removable: customerRemovable.value,
    })
    emit('created', ingredient.id)
  } catch (e) {
    error.value = detailOf(e) ?? 'No se pudo crear el insumo.'
  } finally {
    saving.value = false
  }
}

const label = 'mb-1 block eyebrow'
const control =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20'
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-graphite-900/50 backdrop-blur-sm" @click="emit('close')" />
      <div class="relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-paper shadow-2xl">
        <div class="docket-perf h-[6px] w-full" />
        <div class="flex flex-col gap-3 p-6">
          <div>
            <p class="eyebrow">Inventario</p>
            <h3 class="mt-1 font-display text-lg font-semibold text-ink">Nuevo insumo</h3>
          </div>
          <p v-if="error" role="alert" class="rounded-lg bg-alert/8 px-3 py-2 font-mono text-[11px] text-alert-600">{{ error }}</p>
          <label><span :class="label">Nombre</span><input v-model="name" :class="control" placeholder="Papa" @keyup.enter="submit" /></label>
          <label><span :class="label">Unidad de medida</span>
            <select v-model="unitId" :class="control">
              <option v-for="u in unitOptions" :key="u.id" :value="u.id">{{ u.name }} ({{ u.abbreviation }})</option>
            </select>
          </label>
          <label class="flex items-center justify-between gap-3 rounded-lg bg-sunken/40 px-3 py-2">
            <span class="min-w-0">
              <span class="block text-sm text-ink">Quitable por el cliente</span>
              <span class="block font-mono text-[10px] text-steel-500">Desactívalo para sal, aceite y similares.</span>
            </span>
            <button
              type="button"
              role="switch"
              :aria-checked="customerRemovable"
              class="relative h-5 w-9 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              :class="customerRemovable ? 'bg-ember' : 'bg-line'"
              @click="customerRemovable = !customerRemovable"
            >
              <span class="absolute top-0.5 size-4 rounded-full bg-white transition-all" :class="customerRemovable ? 'left-4' : 'left-0.5'" />
            </button>
          </label>
          <p class="rounded-lg bg-sunken/60 px-3 py-2 font-mono text-[11px] text-steel-500">
            El costo se calcula solo cuando registres una compra de este insumo.
          </p>
          <div class="mt-1 flex justify-end gap-2">
            <button type="button" class="rounded-lg px-4 py-2 text-sm font-medium text-steel-600 transition hover:bg-sunken" @click="emit('close')">Cancelar</button>
            <button type="button" :disabled="!valid || saving" class="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember-600 disabled:opacity-40" @click="submit">Crear y añadir</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
