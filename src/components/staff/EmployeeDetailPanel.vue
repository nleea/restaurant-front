<script setup lang="ts">
// Employee detail. Three blocks, in the order a manager asks about them: who this is and
// whether they're on staff (header), what they can open (role), and when they're on the line
// (calendar).
import { computed, onMounted, ref, watch } from 'vue'
import { useStaffStore } from '@/stores/staff'
import { statusOf } from '@/lib/apiError'
import { initialsOf } from '@/lib/initials'
import { toISODate } from '@/lib/calendar'
import RoleSelector from '@/components/staff/RoleSelector.vue'
import ShiftCalendar from '@/components/staff/ShiftCalendar.vue'
import AddShiftModal from '@/components/staff/AddShiftModal.vue'
import type { Employee } from '@/services/staff.api'
import {
  getContactableChats,
  getEscalationRecipients,
  linkRecipientChat,
  type ContactableChat,
  type EscalationRecipient,
} from '@/services/alerts.api'

const props = defineProps<{ employee: Employee; canManage: boolean }>()
const emit = defineEmits<{ back: [] }>()

const staff = useStaffStore()

const name = computed(() => staff.employeeName(props.employee))
const initials = computed(() => initialsOf(name.value))
const shifts = computed(() => staff.shiftsOf(props.employee.id))

// --- Contacto -------------------------------------------------------------
const phoneDraft = ref(props.employee.phone ?? '')
const savingPhone = ref(false)
const phoneError = ref<string | null>(null)
const phoneChanged = computed(() => phoneDraft.value.trim() !== (props.employee.phone ?? ''))

// Cambiar de empleado tiene que recargar el borrador, o se quedaría el del anterior.
watch(
  () => props.employee.id,
  () => {
    phoneDraft.value = props.employee.phone ?? ''
    phoneError.value = null
  },
)

async function savePhone() {
  if (savingPhone.value || !phoneChanged.value) return
  savingPhone.value = true
  phoneError.value = null
  try {
    await staff.setPhone(props.employee.id, phoneDraft.value.trim() || null)
  } catch {
    phoneError.value = 'No se pudo guardar el teléfono.'
  } finally {
    savingPhone.value = false
  }
}

// --- Alertas por WhatsApp --------------------------------------------------
// El estado por persona lo da el módulo de alertas, que es el único que sabe a la vez si
// hay teléfono y si esa persona ya escribió al número del negocio. La ficha sólo lo pinta.
const savingSubscription = ref(false)
const recipients = ref<EscalationRecipient[]>([])

const alertStatus = computed(() => {
  const mine = recipients.value.find((r) => r.employee_id === props.employee.id)
  if (!mine) return null
  if (!mine.has_chat) {
    return { ok: false, text: 'Falta emparejar su chat: no le llegaría nada.' }
  }
  if (!mine.reachable) {
    return { ok: false, text: 'Ese chat ya no sirve para escribir. Vuelve a emparejarlo.' }
  }
  return { ok: true, text: 'Emparejado: se le puede escribir.' }
})

const chats = ref<ContactableChat[]>([])
const linkingChat = ref(false)

/** Elegir el chat es lo que hace posible escribirle; no hay forma de deducirlo. */
async function linkChat(contactId: string) {
  if (linkingChat.value) return
  linkingChat.value = true
  try {
    await linkRecipientChat(props.employee.branch_id, props.employee.id, contactId || null)
    await staff.fetchEmployees()
    await loadRecipients()
  } finally {
    linkingChat.value = false
  }
}

async function loadRecipients() {
  const branchId = props.employee.branch_id
  // Best-effort: sin `alerts.read` esto da 403 y la ficha funciona igual, sólo sin el detalle.
  // Best-effort: sin `alerts.manage` esto da 403 y la ficha funciona igual, sólo sin el
  // detalle ni el selector.
  const [people, contactable] = await Promise.all([
    getEscalationRecipients(branchId).catch(() => []),
    getContactableChats(branchId).catch(() => []),
  ])
  recipients.value = people
  chats.value = contactable
}

// Aquí y no arriba: un `watch` inmediato que llama a `loadRecipients` antes de declararlo
// se ejecuta en el setup y revienta.
watch(() => props.employee.id, loadRecipients, { immediate: true })

async function toggleSubscription() {
  if (savingSubscription.value) return
  savingSubscription.value = true
  try {
    await staff.setAlertSubscription(props.employee.id, !props.employee.receives_alerts)
    await loadRecipients()
  } finally {
    savingSubscription.value = false
  }
}

// --- Active state ----------------------------------------------------------
// Toggled without a confirm step on purpose: now that reactivation exists, the action is
// fully reversible, and the banner below states the consequence.
const togglingActive = ref(false)
const activeError = ref<string | null>(null)

async function toggleActive() {
  togglingActive.value = true
  activeError.value = null
  try {
    await staff.setActive(props.employee.id, !props.employee.is_active)
  } catch {
    activeError.value = props.employee.is_active
      ? 'No se pudo desactivar al empleado.'
      : 'No se pudo reactivar al empleado.'
  } finally {
    togglingActive.value = false
  }
}

// --- Role ------------------------------------------------------------------
const savingRole = ref(false)
const roleError = ref<string | null>(null)

async function changeRole(roleId: string) {
  savingRole.value = true
  roleError.value = null
  try {
    await staff.changeRole(props.employee.id, roleId)
  } catch {
    roleError.value = 'No se pudo cambiar el rol.'
  } finally {
    savingRole.value = false
  }
}

// --- Shifts ----------------------------------------------------------------
const shiftsLoading = ref(false)
const shiftError = ref<string | null>(null)
const showAdd = ref(false)
const addDate = ref(toISODate(new Date()))
const addingShift = ref(false)
const addError = ref<string | null>(null)

async function loadShifts() {
  shiftsLoading.value = true
  shiftError.value = null
  try {
    await staff.fetchShifts(props.employee.id)
  } catch {
    shiftError.value = 'No se pudieron cargar los turnos.'
  } finally {
    shiftsLoading.value = false
  }
}

onMounted(loadShifts)
watch(
  () => props.employee.id,
  () => {
    roleError.value = null
    activeError.value = null
    showAdd.value = false
    void loadShifts()
  },
)

function openAdd(iso: string) {
  addDate.value = iso
  addError.value = null
  showAdd.value = true
}

async function submitShift(input: { shift_date: string; start_time: string; end_time: string }) {
  addingShift.value = true
  addError.value = null
  try {
    await staff.addShift(props.employee.id, input)
    showAdd.value = false
  } catch (e) {
    addError.value =
      statusOf(e) === 422
        ? 'Turno inválido: revisa la fecha y el rango horario.'
        : 'No se pudo crear el turno.'
  } finally {
    addingShift.value = false
  }
}

async function removeShift(shiftId: string) {
  shiftError.value = null
  try {
    await staff.removeShift(props.employee.id, shiftId)
  } catch {
    shiftError.value = 'No se pudo eliminar el turno.'
  }
}
</script>

<template>
  <div class="p-5">
    <button
      type="button"
      class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
      @click="emit('back')"
    >
      <i class="pi pi-angle-left" /> Empleados
    </button>

    <!-- Header: identity + the active switch. Never dimmed — reactivating must stay reachable. -->
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl font-mono text-sm font-bold tracking-wide transition"
          :class="employee.is_active ? 'bg-ember-50 text-ember-600' : 'bg-sunken text-steel-400'"
          aria-hidden="true"
        >
          {{ initials }}
        </span>
        <div class="min-w-0">
          <h3 class="truncate font-display text-xl font-extrabold leading-tight text-ink">
            {{ name }}
          </h3>
          <p class="truncate font-mono text-[12px] text-steel-500">
            {{ staff.employeeEmail(employee) }}
          </p>
          <p class="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-steel-400">
            {{ staff.branchName(employee.branch_id) }}
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2.5">
        <span
          class="font-mono text-[10px] uppercase tracking-[0.16em]"
          :class="employee.is_active ? 'text-ember-600' : 'text-steel-500'"
        >
          {{ employee.is_active ? 'Activo' : 'Inactivo' }}
        </span>
        <button
          v-if="canManage"
          type="button"
          role="switch"
          :aria-checked="employee.is_active"
          :aria-label="employee.is_active ? 'Desactivar empleado' : 'Reactivar empleado'"
          :disabled="togglingActive"
          class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60"
          :class="employee.is_active ? 'bg-ember' : 'bg-steel-300'"
          @click="toggleActive"
        >
          <span
            class="absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all duration-150 motion-reduce:transition-none"
            :class="employee.is_active ? 'left-[1.375rem]' : 'left-0.5'"
          />
        </button>
        <span
          v-else
          class="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
          :class="employee.is_active ? 'bg-ember/10 text-ember' : 'bg-steel-500/10 text-steel-500'"
        >
          {{ employee.is_active ? 'Activo' : 'Inactivo' }}
        </span>
      </div>
    </header>

    <p
      v-if="activeError"
      role="alert"
      class="mt-3 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
    >
      {{ activeError }}
    </p>

    <!-- Inactive banner: states the consequence, points at the switch above. -->
    <p
      v-if="!employee.is_active"
      class="mt-4 rounded-lg border border-line bg-sunken px-3.5 py-2.5 text-[13px] text-muted"
    >
      Este empleado está inactivo.
      <span v-if="canManage">Reactívalo con el interruptor de arriba para asignarle turnos.</span>
      <span v-else>Pídele a un administrador que lo reactive para asignarle turnos.</span>
    </p>

    <!-- Everything below is dimmed while inactive, but stays readable. -->
    <div
      class="mt-5 flex flex-col gap-4 transition-opacity"
      :class="employee.is_active ? '' : 'opacity-55 grayscale'"
    >
      <!-- Contacto. Existe por una razón concreta: es a dónde el sistema le escribe cuando
           una alerta lleva rato sin que nadie la tome. Sin teléfono, esa persona no recibe
           nada — y hasta ahora no había forma de ponérselo desde la aplicación. -->
      <section class="rounded-xl border border-line bg-paper p-4">
        <h3 class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
          Teléfono de contacto
        </h3>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <input
            v-model="phoneDraft"
            type="tel"
            inputmode="tel"
            :disabled="!canManage || savingPhone"
            placeholder="+57 300 111 2233"
            data-testid="employee-phone"
            class="min-w-[12rem] flex-1 rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-ember/60 disabled:opacity-60"
          />
          <button
            v-if="canManage"
            type="button"
            :disabled="!phoneChanged || savingPhone"
            data-testid="save-phone"
            class="rounded-lg bg-ember px-3 py-2 text-sm font-medium text-white transition hover:bg-ember-600 disabled:opacity-40"
            @click="savePhone"
          >
            {{ savingPhone ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
        <p
          v-if="phoneError"
          role="alert"
          class="mt-1 font-mono text-[11px] text-alert"
          data-testid="phone-error"
        >
          {{ phoneError }}
        </p>
        <p v-else class="mt-1 font-mono text-[10px] leading-relaxed text-steel-400">
          Escríbelo como quieras (`+57`, espacios, guiones): se guarda normalizado.
        </p>

        <!-- La elección, separada del permiso a propósito: ver el panel de alertas y que le
             suene el móvil a las once de la noche son cosas distintas. -->
        <div
          class="mt-3 flex items-start justify-between gap-3 rounded-lg border border-line bg-app p-3"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium text-ink">Recibe alertas por WhatsApp</p>
            <p class="mt-0.5 font-mono text-[10px] leading-relaxed text-steel-400">
              Le escribimos cuando una alerta lleva rato sin que nadie la tome. Seguirá viendo
              el panel igual si lo apagas.
            </p>
            <p
              v-if="employee.receives_alerts && alertStatus"
              class="mt-1 font-mono text-[10px] leading-relaxed"
              :class="alertStatus.ok ? 'text-success' : 'text-warn'"
              data-testid="alert-reachability"
            >
              {{ alertStatus.text }}
            </p>

            <!-- El emparejamiento. Se elige de entre los chats que YA escribieron porque
                 deducirlo del teléfono es imposible: en modo privacidad WhatsApp manda un
                 `@lid` y nunca nos da el número. Que exista el chat ES la prueba de que se
                 le puede escribir. -->
            <div v-if="employee.receives_alerts && canManage" class="mt-2">
              <select
                :value="employee.whatsapp_contact_id ?? ''"
                :disabled="linkingChat"
                data-testid="chat-picker"
                aria-label="Chat de WhatsApp de esta persona"
                class="w-full rounded-lg border border-line bg-paper px-2 py-1.5 font-mono text-[11px] text-ink outline-none focus:border-ember/60 disabled:opacity-60"
                @change="linkChat(($event.target as HTMLSelectElement).value)"
              >
                <option value="">— Sin emparejar —</option>
                <option v-for="chat in chats" :key="chat.contact_id" :value="chat.contact_id">
                  {{ chat.name ?? 'Sin nombre' }} · {{ chat.address }}
                </option>
              </select>
              <p
                v-if="!chats.length"
                class="mt-1 font-mono text-[10px] leading-relaxed text-steel-400"
                data-testid="no-chats"
              >
                Todavía nadie le ha escrito al número de esta sucursal. Pídele a esta persona
                que mande un "hola" y vuelve aquí.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="employee.receives_alerts ?? false"
            aria-label="Recibe alertas por WhatsApp"
            :disabled="!canManage || savingSubscription"
            data-testid="alert-subscription"
            class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
            :class="employee.receives_alerts ? 'bg-success' : 'bg-steel-300'"
            @click="toggleSubscription"
          >
            <span
              class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
              :class="employee.receives_alerts ? 'left-[22px]' : 'left-0.5'"
            />
          </button>
        </div>
      </section>

      <RoleSelector
        :role-id="employee.role_id"
        :can-manage="canManage"
        :saving="savingRole"
        :frozen="!employee.is_active"
        @change="changeRole"
      />
      <p
        v-if="roleError"
        role="alert"
        class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
      >
        {{ roleError }}
      </p>

      <p
        v-if="shiftError"
        role="alert"
        class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
      >
        {{ shiftError }}
      </p>
      <ShiftCalendar
        :shifts="shifts"
        :can-manage="canManage"
        :loading="shiftsLoading"
        :frozen="!employee.is_active"
        @add="openAdd"
        @remove="removeShift"
      />
    </div>

    <AddShiftModal
      v-model:visible="showAdd"
      :date="addDate"
      :employee-name="name"
      :saving="addingShift"
      :error="addError"
      @submit="submitShift"
    />
  </div>
</template>
