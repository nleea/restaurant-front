<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useCatalogStore } from '@/stores/catalog'
import { statusOf } from '@/lib/apiError'
import type { Unit } from '@/services/catalog.api'

const auth = useAuthStore()
const catalog = useCatalogStore()
const canManage = computed(() => auth.can('catalog.manage'))

const selected = ref<Unit | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

// Create/edit form state (shared dialog).
const showForm = ref(false)
const editingId = ref<string | null>(null)
const fName = ref('')
const fAbbr = ref('')
const fBaseUnitId = ref<string | null>(null)
const fFactor = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

onMounted(async () => {
  loading.value = true
  try {
    await catalog.fetchUnits()
  } catch {
    error.value = 'No se pudieron cargar las unidades.'
  } finally {
    loading.value = false
  }
})

// Base-unit options for the derived-unit select (exclude the unit being edited to avoid self-ref).
const baseOptions = computed(() =>
  catalog.baseUnits
    .filter((u) => u.id !== editingId.value)
    .map((u) => ({ label: `${u.name} (${u.abbreviation})`, value: u.id })),
)

function select(unit: Unit) {
  selected.value = unit
}

function openCreate() {
  editingId.value = null
  fName.value = ''
  fAbbr.value = ''
  fBaseUnitId.value = null
  fFactor.value = ''
  formError.value = null
  showForm.value = true
}

function openEdit(unit: Unit) {
  editingId.value = unit.id
  fName.value = unit.name
  fAbbr.value = unit.abbreviation
  fBaseUnitId.value = unit.base_unit_id
  fFactor.value = unit.conversion_factor ?? ''
  formError.value = null
  showForm.value = true
}

const isDerived = computed(() => fBaseUnitId.value !== null)

const canSubmit = computed(() => {
  if (!fName.value.trim() || !fAbbr.value.trim()) return false
  // A derived unit needs a positive conversion factor; a base unit must not carry one.
  if (isDerived.value) return Number(fFactor.value) > 0
  return true
})

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  formError.value = null
  const input = {
    name: fName.value.trim(),
    abbreviation: fAbbr.value.trim(),
    base_unit_id: fBaseUnitId.value,
    conversion_factor: isDerived.value ? fFactor.value.trim() : null,
  }
  try {
    if (editingId.value) {
      await catalog.updateUnit(editingId.value, input)
      selected.value = catalog.units.find((u) => u.id === editingId.value) ?? null
    } else {
      const unit = await catalog.createUnit(input)
      selected.value = catalog.units.find((u) => u.id === unit.id) ?? unit
    }
    showForm.value = false
  } catch (e) {
    const status = statusOf(e)
    formError.value =
      status === 409 || status === 422
        ? 'Datos inválidos: revisa la unidad base y el factor de conversión.'
        : 'No se pudo guardar la unidad.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="lg:grid lg:grid-cols-[19rem_1fr] lg:gap-6">
    <!-- LIST (drill-down master) -->
    <aside class="flex flex-col gap-3" :class="selected ? 'max-lg:hidden' : ''">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Unidades</h2>
        <Button v-if="canManage" label="Nueva" size="small" icon="pi pi-plus" @click="openCreate" />
      </div>

      <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
        {{ error }}
      </p>
      <div v-if="loading" class="text-steel-500">Cargando unidades…</div>

      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="unit in catalog.units" :key="unit.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="selected?.id === unit.id ? 'border-ember ring-1 ring-ember/30' : ''"
            @click="select(unit)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">
                {{ unit.name }}
                <span class="font-mono text-[11px] text-steel-500">{{ unit.abbreviation }}</span>
              </span>
              <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
                {{ unit.base_unit_id ? 'derivada' : 'base' }}
              </span>
            </span>
            <span class="shrink-0 text-steel-500 lg:hidden" aria-hidden="true">
              <i class="pi pi-angle-right" />
            </span>
          </button>
        </li>
      </ul>
    </aside>

    <!-- DETAIL -->
    <section
      class="rounded-xl border border-line bg-paper"
      :class="selected ? 'max-lg:mt-0' : 'max-lg:hidden'"
    >
      <div v-if="!selected" class="grid h-48 place-items-center px-6 text-center text-steel-500">
        Elige una unidad para ver sus detalles.
      </div>

      <Transition name="detail">
        <div v-if="selected" :key="selected.id" class="p-5">
          <button
            type="button"
            class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
            @click="selected = null"
          >
            <i class="pi pi-angle-left" /> Unidades
          </button>

          <header class="mb-4 flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-lg font-extrabold text-ink">{{ selected.name }}</h3>
              <p class="font-mono text-sm text-steel-500">{{ selected.abbreviation }}</p>
            </div>
            <Button v-if="canManage" label="Editar" size="small" outlined icon="pi pi-pencil" @click="openEdit(selected)" />
          </header>

          <dl class="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
            <dt class="text-steel-500">Tipo</dt>
            <dd class="text-ink">{{ selected.base_unit_id ? 'Derivada' : 'Base' }}</dd>
            <template v-if="selected.base_unit_id">
              <dt class="text-steel-500">Unidad base</dt>
              <dd class="text-ink">{{ catalog.unitName(selected.base_unit_id) ?? '—' }}</dd>
              <dt class="text-steel-500">Factor</dt>
              <dd class="font-mono text-ink">{{ selected.conversion_factor }}</dd>
            </template>
          </dl>
        </div>
      </Transition>
    </section>

    <!-- Create / edit dialog -->
    <Dialog
      v-model:visible="showForm"
      modal
      :header="editingId ? 'Editar unidad' : 'Nueva unidad'"
      :style="{ width: '26rem' }"
      :breakpoints="{ '480px': '92vw' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="u-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="u-name" v-model="fName" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="u-abbr" class="text-xs font-medium uppercase tracking-wide text-steel-500">Abreviatura</label>
          <InputText id="u-abbr" v-model="fAbbr" fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="u-base" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Unidad base (opcional)
          </label>
          <Select
            id="u-base"
            v-model="fBaseUnitId"
            :options="baseOptions"
            option-label="label"
            option-value="value"
            placeholder="Ninguna (es unidad base)"
            show-clear
            fluid
          />
        </div>
        <div v-if="isDerived" class="flex flex-col gap-1.5">
          <label for="u-factor" class="text-xs font-medium uppercase tracking-wide text-steel-500">
            Factor de conversión
          </label>
          <InputText id="u-factor" v-model="fFactor" fluid inputmode="decimal" placeholder="p. ej. 1000" />
          <p class="font-mono text-[11px] text-steel-500">Cuántas unidades base equivalen a 1 de esta.</p>
        </div>

        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showForm = false" />
        <Button label="Guardar" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
