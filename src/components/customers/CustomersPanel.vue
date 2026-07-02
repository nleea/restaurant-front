<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { useAuthStore } from '@/stores/auth'
import { useCustomersStore } from '@/stores/customers'
import { useStaffStore } from '@/stores/staff'
import { statusOf } from '@/lib/apiError'
import CustomerDetail from '@/components/customers/CustomerDetail.vue'
import type { Customer } from '@/services/customers.api'

// Orchestrates the customers screen (tenant-scoped — no branch): loads customers and the staff
// directory (for the settlement employee picker), renders the directory (master) with an active
// filter and name/document search, and the selected customer's detail.
const auth = useAuthStore()
const customers = useCustomersStore()
const staff = useStaffStore()

const canManage = computed(() => auth.can('customers.manage'))

const loading = ref(false)
const error = ref<string | null>(null)
const activeOnly = ref(true)
const search = ref('')

const employeeOptions = computed(() =>
  staff.employees.filter((e) => e.is_active).map((e) => ({ label: staff.employeeName(e), value: e.id })),
)

const visibleCustomers = computed<Customer[]>(() => {
  const q = search.value.trim().toLowerCase()
  return customers.customers.filter((c) => {
    if (activeOnly.value && !c.is_active) return false
    if (!q) return true
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase()
    return name.includes(q) || (c.document_number ?? '').toLowerCase().includes(q)
  })
})

async function load() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([customers.loadCustomers(), staff.ensureLoaded({ active: true })])
  } catch {
    error.value = 'No se pudieron cargar los clientes.'
  } finally {
    loading.value = false
  }
}

async function select(customer: Customer) {
  customers.selectedCustomerId = customer.id
  await customers.selectCustomer(customer.id)
}

onMounted(load)

// --- New-customer dialog ---------------------------------------------------
const showCreate = ref(false)
const fFirst = ref('')
const fLast = ref('')
const fDoc = ref('')
const fPhone = ref('')
const fEmail = ref('')
const saving = ref(false)
const formError = ref<string | null>(null)

function openCreate() {
  fFirst.value = ''
  fLast.value = ''
  fDoc.value = ''
  fPhone.value = ''
  fEmail.value = ''
  formError.value = null
  showCreate.value = true
}
const canSubmit = computed(() => fFirst.value.trim() !== '' && fLast.value.trim() !== '')
async function submit() {
  if (!canSubmit.value) return
  saving.value = true
  formError.value = null
  try {
    const customer = await customers.createCustomer({
      first_name: fFirst.value.trim(),
      last_name: fLast.value.trim(),
      document_number: fDoc.value.trim() || null,
      phone: fPhone.value.trim() || null,
      email: fEmail.value.trim() || null,
    })
    showCreate.value = false
    await select(customer)
  } catch (e) {
    formError.value =
      statusOf(e) === 409 ? 'Ese cliente ya existe.' : 'No se pudo crear el cliente.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex items-center justify-end">
      <Button label="Actualizar" size="small" severity="secondary" outlined icon="pi pi-refresh" :loading="loading" @click="load" />
    </div>

    <p v-if="error" role="alert" class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
      {{ error }}
    </p>

    <div v-if="loading" class="text-steel-500">Cargando clientes…</div>

    <div v-else class="lg:grid lg:grid-cols-[22rem_1fr] lg:gap-6">
      <!-- LIST (drill-down master) -->
      <aside class="flex flex-col gap-3" :class="customers.selectedCustomerId ? 'max-lg:hidden' : ''">
        <div class="flex items-center justify-between gap-2">
          <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Clientes</h2>
          <Button v-if="canManage" label="Nuevo" size="small" icon="pi pi-plus" @click="openCreate" />
        </div>

        <InputText v-model="search" placeholder="Buscar por nombre o documento" fluid />
        <label class="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
          <ToggleSwitch v-model="activeOnly" />
          Solo activos
        </label>

        <p v-if="!visibleCustomers.length" class="text-steel-500">No hay clientes.</p>
        <ul v-else class="flex flex-col gap-1.5">
          <li v-for="cust in visibleCustomers" :key="cust.id">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
              :class="customers.selectedCustomerId === cust.id ? 'border-ember ring-1 ring-ember/30' : ''"
              @click="select(cust)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium text-ink">{{ customers.customerName(cust) }}</span>
                <span class="block truncate font-mono text-[10px] uppercase tracking-wide text-steel-500">
                  {{ cust.document_number || cust.phone || '—' }}
                </span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span v-if="!cust.is_active" class="rounded-full bg-steel-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-steel-500">Inactivo</span>
                <span class="text-steel-500 lg:hidden" aria-hidden="true"><i class="pi pi-angle-right" /></span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- DETAIL -->
      <section class="rounded-xl border border-line bg-paper" :class="customers.selectedCustomerId ? '' : 'max-lg:hidden'">
        <div v-if="!customers.selectedCustomer" class="grid h-48 place-items-center px-6 text-center text-steel-500">
          Elige un cliente para ver su detalle.
        </div>
        <Transition name="detail">
          <CustomerDetail
            v-if="customers.selectedCustomer"
            :key="customers.selectedCustomer.id"
            :customer="customers.selectedCustomer"
            :employee-options="employeeOptions"
            :can-manage="canManage"
            @back="customers.selectedCustomerId = null"
          />
        </Transition>
      </section>
    </div>

    <!-- New-customer dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nuevo cliente" :style="{ width: '28rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="cu-first" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
            <InputText id="cu-first" v-model="fFirst" fluid autofocus maxlength="100" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="cu-last" class="text-xs font-medium uppercase tracking-wide text-steel-500">Apellido</label>
            <InputText id="cu-last" v-model="fLast" fluid maxlength="100" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="cu-doc" class="text-xs font-medium uppercase tracking-wide text-steel-500">Documento (opcional)</label>
          <InputText id="cu-doc" v-model="fDoc" fluid maxlength="50" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label for="cu-phone" class="text-xs font-medium uppercase tracking-wide text-steel-500">Teléfono</label>
            <InputText id="cu-phone" v-model="fPhone" fluid maxlength="30" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label for="cu-email" class="text-xs font-medium uppercase tracking-wide text-steel-500">Correo</label>
            <InputText id="cu-email" v-model="fEmail" fluid type="email" maxlength="150" />
          </div>
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
