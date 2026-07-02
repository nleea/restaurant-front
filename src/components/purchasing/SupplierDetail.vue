<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { usePurchasingStore } from '@/stores/purchasing'
import { useCatalogStore } from '@/stores/catalog'
import { formatCOP } from '@/lib/money'
import { statusOf } from '@/lib/apiError'
import type { Supplier } from '@/services/purchasing.api'

// Detail pane for one supplier: contact info with an edit form and a deactivate action, plus the
// supplier's ingredient catalog (attach/detach with a unit + reference price). All mutations gated
// by `purchasing.manage` from the parent.
const props = defineProps<{
  supplier: Supplier
  ingredientOptions: { label: string; value: string }[]
  canManage: boolean
}>()
const emit = defineEmits<{ back: [] }>()

const purchasing = usePurchasingStore()
const catalogStore = useCatalogStore()

const unitOptions = computed(() =>
  catalogStore.units.map((u) => ({ label: `${u.name} (${u.abbreviation})`, value: u.id })),
)

// Ingredients not yet on this supplier's catalog — keeps the picker from offering duplicates.
const attachableIngredients = computed(() => {
  const taken = new Set(purchasing.catalog.map((c) => c.ingredient_id))
  return props.ingredientOptions.filter((o) => !taken.has(o.value))
})

// --- Edit contact dialog ---------------------------------------------------
const showEdit = ref(false)
const fName = ref('')
const fTaxId = ref('')
const fPhone = ref('')
const fEmail = ref('')
const fAddress = ref('')
const editSaving = ref(false)
const editError = ref<string | null>(null)

function openEdit() {
  fName.value = props.supplier.name
  fTaxId.value = props.supplier.tax_id ?? ''
  fPhone.value = props.supplier.phone ?? ''
  fEmail.value = props.supplier.email ?? ''
  fAddress.value = props.supplier.address ?? ''
  editError.value = null
  showEdit.value = true
}

const canSubmitEdit = computed(() => fName.value.trim() !== '')

async function submitEdit() {
  if (!canSubmitEdit.value) return
  editSaving.value = true
  editError.value = null
  try {
    await purchasing.updateSupplier(props.supplier.id, {
      name: fName.value.trim(),
      tax_id: fTaxId.value.trim() || null,
      phone: fPhone.value.trim() || null,
      email: fEmail.value.trim() || null,
      address: fAddress.value.trim() || null,
    })
    showEdit.value = false
  } catch {
    editError.value = 'No se pudo guardar el proveedor.'
  } finally {
    editSaving.value = false
  }
}

// --- Deactivate ------------------------------------------------------------
const deactivating = ref(false)
async function deactivate() {
  deactivating.value = true
  try {
    await purchasing.deactivateSupplier(props.supplier.id)
  } finally {
    deactivating.value = false
  }
}

// --- Attach ingredient dialog ----------------------------------------------
const showAttach = ref(false)
const aIngredient = ref<string | null>(null)
const aUnit = ref<string | null>(null)
const aPrice = ref<number | null>(null)
const attachSaving = ref(false)
const attachError = ref<string | null>(null)

function openAttach() {
  aIngredient.value = null
  aUnit.value = null
  aPrice.value = null
  attachError.value = null
  showAttach.value = true
}

const canSubmitAttach = computed(
  () => aIngredient.value !== null && aUnit.value !== null && aPrice.value !== null && aPrice.value >= 0,
)

async function submitAttach() {
  if (!canSubmitAttach.value || aIngredient.value === null || aUnit.value === null) return
  attachSaving.value = true
  attachError.value = null
  try {
    await purchasing.attachIngredient(props.supplier.id, {
      ingredient_id: aIngredient.value,
      reference_price: (aPrice.value ?? 0).toFixed(2),
      unit_of_measure_id: aUnit.value,
    })
    showAttach.value = false
  } catch (e) {
    const status = statusOf(e)
    attachError.value =
      status === 409
        ? 'Ese ingrediente ya está registrado para este proveedor.'
        : status === 404
          ? 'El ingrediente o la unidad no existe.'
          : 'No se pudo agregar el ingrediente.'
  } finally {
    attachSaving.value = false
  }
}

async function detach(ingredientId: string) {
  await purchasing.detachIngredient(props.supplier.id, ingredientId)
}
</script>

<template>
  <div class="p-4 sm:p-5">
    <button
      type="button"
      class="mb-3 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-steel-500 transition hover:text-ink lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Volver
    </button>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="truncate text-lg font-semibold text-ink">{{ supplier.name }}</h2>
        <p
          v-if="!supplier.is_active"
          class="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-steel-500"
        >
          Inactivo
        </p>
      </div>
      <div v-if="canManage" class="flex gap-2">
        <Button label="Editar" size="small" severity="secondary" outlined icon="pi pi-pencil" @click="openEdit" />
        <Button
          v-if="supplier.is_active"
          label="Desactivar"
          size="small"
          severity="secondary"
          text
          icon="pi pi-ban"
          :loading="deactivating"
          @click="deactivate"
        />
      </div>
    </div>

    <!-- Contact info -->
    <dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">NIT / Tax id</dt>
        <dd class="text-ink">{{ supplier.tax_id || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Teléfono</dt>
        <dd class="text-ink">{{ supplier.phone || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Correo</dt>
        <dd class="truncate text-ink">{{ supplier.email || '—' }}</dd>
      </div>
      <div>
        <dt class="font-mono text-[10px] uppercase tracking-wide text-steel-500">Dirección</dt>
        <dd class="text-ink">{{ supplier.address || '—' }}</dd>
      </div>
    </dl>

    <!-- Ingredient catalog -->
    <div class="mt-5 flex items-center justify-between gap-2">
      <h3 class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">Catálogo de ingredientes</h3>
      <Button v-if="canManage" label="Agregar" size="small" icon="pi pi-plus" @click="openAttach" />
    </div>

    <p v-if="!purchasing.catalog.length" class="mt-2 text-sm text-steel-500">
      Este proveedor aún no tiene ingredientes registrados.
    </p>
    <ul v-else class="mt-2 divide-y divide-line rounded-lg border border-line bg-paper">
      <li
        v-for="row in purchasing.catalog"
        :key="row.id"
        class="flex items-center justify-between gap-3 px-3 py-2"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm text-ink">{{ purchasing.ingredientLabel(row.ingredient_id) }}</span>
          <span class="block font-mono text-[10px] uppercase tracking-wide text-steel-500">
            {{ purchasing.unitAbbrOf(row.ingredient_id) || '—' }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-3">
          <span class="font-mono text-sm text-ink">{{ formatCOP(row.reference_price) }}</span>
          <button
            v-if="canManage"
            type="button"
            class="grid size-7 place-items-center rounded-md text-steel-500 transition hover:bg-alert/10 hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
            aria-label="Quitar ingrediente"
            @click="detach(row.ingredient_id)"
          >
            <i class="pi pi-trash text-xs" />
          </button>
        </span>
      </li>
    </ul>

    <!-- Edit contact dialog -->
    <Dialog v-model:visible="showEdit" modal header="Editar proveedor" :style="{ width: '28rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="s-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="s-name" v-model="fName" fluid autofocus maxlength="150" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="s-tax" class="text-xs font-medium uppercase tracking-wide text-steel-500">NIT / Tax id</label>
            <InputText id="s-tax" v-model="fTaxId" fluid maxlength="50" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="s-phone" class="text-xs font-medium uppercase tracking-wide text-steel-500">Teléfono</label>
            <InputText id="s-phone" v-model="fPhone" fluid maxlength="30" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="s-email" class="text-xs font-medium uppercase tracking-wide text-steel-500">Correo</label>
          <InputText id="s-email" v-model="fEmail" fluid type="email" maxlength="150" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="s-addr" class="text-xs font-medium uppercase tracking-wide text-steel-500">Dirección</label>
          <InputText id="s-addr" v-model="fAddress" fluid maxlength="255" />
        </div>
        <p v-if="editError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ editError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showEdit = false" />
        <Button label="Guardar" :loading="editSaving" :disabled="!canSubmitEdit" @click="submitEdit" />
      </template>
    </Dialog>

    <!-- Attach ingredient dialog -->
    <Dialog v-model:visible="showAttach" modal header="Agregar ingrediente" :style="{ width: '26rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="a-ing" class="text-xs font-medium uppercase tracking-wide text-steel-500">Ingrediente</label>
          <Select
            id="a-ing"
            v-model="aIngredient"
            :options="attachableIngredients"
            option-label="label"
            option-value="value"
            placeholder="Elige un ingrediente"
            filter
            fluid
          />
          <p v-if="!attachableIngredients.length" class="font-mono text-[11px] text-steel-500">
            Todos los ingredientes disponibles ya están registrados.
          </p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="a-unit" class="text-xs font-medium uppercase tracking-wide text-steel-500">Unidad</label>
            <Select id="a-unit" v-model="aUnit" :options="unitOptions" option-label="label" option-value="value" placeholder="Unidad" fluid />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="a-price" class="text-xs font-medium uppercase tracking-wide text-steel-500">Precio ref.</label>
            <InputNumber id="a-price" v-model="aPrice" :min="0" mode="currency" currency="COP" locale="es-CO" :max-fraction-digits="0" fluid />
          </div>
        </div>
        <p v-if="attachError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ attachError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showAttach = false" />
        <Button label="Agregar" :loading="attachSaving" :disabled="!canSubmitAttach" @click="submitAttach" />
      </template>
    </Dialog>
  </div>
</template>
