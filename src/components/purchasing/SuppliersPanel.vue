<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { useAuthStore } from '@/stores/auth'
import { usePurchasingStore } from '@/stores/purchasing'
import { statusOf } from '@/lib/apiError'
import SupplierDetail from '@/components/purchasing/SupplierDetail.vue'
import type { Supplier } from '@/services/purchasing.api'

// Orchestrates the suppliers screen (tenant-scoped — no branch): loads suppliers + the ingredient
// directory, renders the supplier list (master) with an active filter, and the selected supplier's
// detail. Mutations live in SupplierDetail / the new-supplier dialog via the purchasing store.
const auth = useAuthStore()
const purchasing = usePurchasingStore()

const canManage = computed(() => auth.can('purchasing.manage'))

const loading = ref(false)
const error = ref<string | null>(null)
const activeOnly = ref(true)
const selectedId = ref<string | null>(null)

// Ingredient options for the attach picker (resolved labels from the directory).
const ingredientOptions = computed(() =>
  Object.entries(purchasing.ingredientIndex).map(([id, info]) => ({ label: info.name, value: id })),
)

const visibleSuppliers = computed<Supplier[]>(() =>
  activeOnly.value ? purchasing.activeSuppliers : purchasing.suppliers,
)

async function load() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([purchasing.loadSuppliers(), purchasing.loadDirectory()])
  } catch {
    error.value = 'No se pudieron cargar los proveedores.'
  } finally {
    loading.value = false
  }
}

async function select(supplier: Supplier) {
  selectedId.value = supplier.id
  await purchasing.selectSupplier(supplier.id)
}

onMounted(load)

// --- New-supplier dialog ---------------------------------------------------
const showCreate = ref(false)
const fName = ref('')
const fTaxId = ref('')
const fPhone = ref('')
const fEmail = ref('')
const fAddress = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  fName.value = ''
  fTaxId.value = ''
  fPhone.value = ''
  fEmail.value = ''
  fAddress.value = ''
  formError.value = null
  showCreate.value = true
}

const canSubmit = computed(() => fName.value.trim() !== '')

async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  formError.value = null
  try {
    const supplier = await purchasing.createSupplier({
      name: fName.value.trim(),
      tax_id: fTaxId.value.trim() || null,
      phone: fPhone.value.trim() || null,
      email: fEmail.value.trim() || null,
      address: fAddress.value.trim() || null,
    })
    showCreate.value = false
    await select(supplier)
  } catch (e) {
    formError.value =
      statusOf(e) === 422 ? 'Datos inválidos: revisa el nombre y el correo.' : 'No se pudo crear el proveedor.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-end gap-2">
      <Button
        label="Actualizar"
        size="small"
        severity="secondary"
        outlined
        icon="pi pi-refresh"
        :loading="loading"
        @click="load"
      />
    </div>

    <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <div v-if="loading" class="text-steel-500">Cargando proveedores…</div>

    <div v-else class="lg:grid lg:grid-cols-[20rem_1fr] lg:gap-6">
      <!-- LIST (drill-down master) -->
      <aside class="flex flex-col gap-3" :class="selectedId ? 'max-lg:hidden' : ''">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Proveedores</h2>
          <Button v-if="canManage" label="Nuevo" size="small" icon="pi pi-plus" @click="openCreate" />
        </div>

        <label class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
          <ToggleSwitch v-model="activeOnly" />
          Solo activos
        </label>

        <p v-if="!visibleSuppliers.length" class="text-steel-500">No hay proveedores registrados.</p>

        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="sup in visibleSuppliers" :key="sup.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="selectedId === sup.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(sup)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ sup.name }}</span>
                <span v-if="sup.tax_id" class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ sup.tax_id }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span
                  v-if="!sup.is_active"
                  class="rounded-full bg-steel-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-steel-500"
                >
                  Inactivo
                </span>
                <span class="text-steel-500 lg:hidden" aria-hidden="true"><i class="pi pi-angle-right" /></span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="selectedId ? '' : 'max-lg:hidden'">
        <div v-if="!purchasing.selectedSupplier" class="grid h-48 place-items-center px-6 text-center text-steel-500">
          Elige un proveedor para ver su detalle.
        </div>
        <Transition name="detail">
          <SupplierDetail
            v-if="purchasing.selectedSupplier"
            :key="purchasing.selectedSupplier.id"
            :supplier="purchasing.selectedSupplier"
            :ingredient-options="ingredientOptions"
            :can-manage="canManage"
            @back="selectedId = null"
          />
        </Transition>
      </section>
    </div>

    <!-- New-supplier dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nuevo proveedor" :style="{ width: '28rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="n-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="n-name" v-model="fName" fluid autofocus maxlength="150" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="n-tax" class="text-xs font-medium uppercase tracking-wide text-steel-500">NIT / Tax id</label>
            <InputText id="n-tax" v-model="fTaxId" fluid maxlength="50" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="n-phone" class="text-xs font-medium uppercase tracking-wide text-steel-500">Teléfono</label>
            <InputText id="n-phone" v-model="fPhone" fluid maxlength="30" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="n-email" class="text-xs font-medium uppercase tracking-wide text-steel-500">Correo</label>
          <InputText id="n-email" v-model="fEmail" fluid type="email" maxlength="150" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="n-addr" class="text-xs font-medium uppercase tracking-wide text-steel-500">Dirección</label>
          <InputText id="n-addr" v-model="fAddress" fluid maxlength="255" />
        </div>
        <p v-if="formError" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
          {{ formError }}
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCreate = false" />
        <Button label="Crear" :loading="saving" :disabled="!canSubmit" @click="submit" />
      </template>
    </Dialog>
  </div>
</template>
