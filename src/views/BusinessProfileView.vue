<script setup lang="ts">
// "Perfil del negocio": the admin editor for the tenant's identity (name, NIT, contacto) and its
// branches — each with editable address/phone and a weekly operating-hours grid. Reads are open;
// every save requires `menu.manage`, so without it the whole screen turns read-only. El Pase chrome:
// mono kickers, ember only for the active/heat accents. Hours are minutes-from-midnight (480 = 08:00,
// 1440 = 24:00); weekday 0 = Lunes … 6 = Domingo; a weekday with no window = cerrado.
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AppShell from '@/components/AppShell.vue'
import ImageUpload from '@/components/ImageUpload.vue'
import {
  getBusinessProfile,
  setBranchHours,
  updateBusinessProfile,
  type BusinessProfile,
  type HoursWindowInput,
} from '@/services/business.api'

const auth = useAuthStore()
const canEdit = computed(() => auth.can('menu.manage'))

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

// A single editable weekday row (v1 supports one window per day).
interface DayRow {
  weekday: number
  isOpen: boolean
  open: string // "HH:MM"
  close: string // "HH:MM"
}

interface BranchForm {
  id: string
  name: string
  address: string
  phone: string
  isPrimary: boolean
  days: DayRow[]
}

interface IdentityForm {
  name: string
  taxId: string
  email: string
  phone: string
}

const loading = ref(true)
const loadError = ref(false)
const profile = ref<BusinessProfile | null>(null)
const identity = ref<IdentityForm>({ name: '', taxId: '', email: '', phone: '' })
const photoUrl = ref('')
// El QR con el que el cliente paga desde la carta. Se sube igual que el logo (R2 vía presign).
const paymentQrUrl = ref('')
const branchForms = ref<BranchForm[]>([])

const savingProfile = ref(false)
const savingHoursId = ref<string | null>(null)
const flash = ref<{ kind: 'success' | 'error'; msg: string } | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined

function showFlash(kind: 'success' | 'error', msg: string): void {
  flash.value = { kind, msg }
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flash.value = null), 4000)
}

// --- Time helpers: minutes-from-midnight ↔ "HH:MM" (00:00 … 24:00) -------------------------
function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Returns minutes-from-midnight, or null when the string isn't a valid 00:00–24:00 time.
function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m) || m > 59) return null
  const total = h * 60 + m
  if (total < 0 || total > 1440) return null
  return total
}

function buildDays(hours: BusinessProfile['branches'][number]['hours']): DayRow[] {
  return Array.from({ length: 7 }, (_, weekday) => {
    // v1: one window per weekday — take the first if the backend sent several.
    const window = hours.find((h) => h.weekday === weekday)
    return {
      weekday,
      isOpen: Boolean(window),
      open: window ? minutesToHHMM(window.openMinute) : '08:00',
      close: window ? minutesToHHMM(window.closeMinute) : '18:00',
    }
  })
}

function hydrate(data: BusinessProfile): void {
  profile.value = data
  // Coalesce nullable backend fields to '' so the form state is always a string (calling
  // .trim() on a null tax id / address is what silently broke every profile save).
  identity.value = {
    name: data.name,
    taxId: data.taxId ?? '',
    email: data.email ?? '',
    phone: data.phone ?? '',
  }
  photoUrl.value = data.photoUrl ?? ''
  paymentQrUrl.value = data.paymentQrUrl ?? ''
  branchForms.value = data.branches.map((b) => ({
    id: b.id,
    name: b.name,
    address: b.address ?? '',
    phone: b.phone ?? '',
    isPrimary: b.isPrimary,
    days: buildDays(b.hours),
  }))
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    hydrate(await getBusinessProfile())
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function saveProfile(): Promise<void> {
  if (!canEdit.value || savingProfile.value) return
  if (!identity.value.name.trim()) {
    showFlash('error', 'El nombre del negocio es obligatorio.')
    return
  }
  savingProfile.value = true
  try {
    const updated = await updateBusinessProfile({
      name: identity.value.name.trim(),
      taxId: identity.value.taxId.trim(),
      email: identity.value.email.trim(),
      phone: identity.value.phone.trim(),
      photoUrl: photoUrl.value,
      paymentQrUrl: paymentQrUrl.value,
      branches: branchForms.value.map((b) => ({
        id: b.id,
        name: b.name.trim(),
        address: b.address.trim(),
        phone: b.phone.trim(),
      })),
    })
    hydrate(updated)
    showFlash('success', 'Datos del negocio guardados.')
  } catch {
    showFlash('error', 'No se pudieron guardar los datos. Intenta de nuevo.')
  } finally {
    savingProfile.value = false
  }
}

async function saveHours(branch: BranchForm): Promise<void> {
  if (!canEdit.value || savingHoursId.value) return
  const windows: HoursWindowInput[] = []
  for (const day of branch.days) {
    if (!day.isOpen) continue
    const openMinute = hhmmToMinutes(day.open)
    const closeMinute = hhmmToMinutes(day.close)
    if (openMinute === null || closeMinute === null) {
      showFlash('error', `Horario inválido en ${WEEKDAYS[day.weekday]} · ${branch.name}.`)
      return
    }
    windows.push({ weekday: day.weekday, openMinute, closeMinute })
  }
  savingHoursId.value = branch.id
  try {
    const saved = await setBranchHours(branch.id, windows)
    branch.days = buildDays(saved)
    showFlash('success', `Horario de ${branch.name} guardado.`)
  } catch {
    showFlash('error', `No se pudo guardar el horario de ${branch.name}.`)
  } finally {
    savingHoursId.value = null
  }
}

const inputCls =
  'rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:cursor-not-allowed disabled:opacity-60'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-4xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="eyebrow">Estación · Negocio</p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Perfil del negocio</h1>
          <p class="text-steel-500">Identidad, contacto y sucursales con su horario de atención.</p>
        </header>

        <!-- Read-only notice when the user lacks menu.manage. -->
        <p
          v-if="!canEdit"
          class="rounded-lg border border-line bg-app px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500"
        >
          Solo lectura · necesitas el permiso <span class="text-ink">menu.manage</span> para editar.
        </p>

        <!-- Flash -->
        <Transition
          enter-active-class="transition-opacity duration-200"
          leave-active-class="transition-opacity duration-200"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <div
            v-if="flash"
            class="rounded-lg border px-4 py-2.5 text-[13px]"
            :class="
              flash.kind === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                : 'border-red-500/30 bg-red-500/10 text-red-700'
            "
            role="status"
          >
            {{ flash.msg }}
          </div>
        </Transition>

        <p v-if="loading" class="text-steel-500">Cargando…</p>
        <p v-else-if="loadError" class="text-red-600">
          No se pudo cargar el perfil.
          <button type="button" class="underline" @click="load">Reintentar</button>
        </p>

        <template v-else>
          <!-- Identity -->
          <section class="card flex flex-col gap-5 p-4 sm:p-5">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="eyebrow">Identidad</p>
                <p class="text-steel-500">Nombre legal, NIT y datos de contacto.</p>
              </div>
              <!-- Logo: editable upload with menu.manage, read-only preview otherwise. -->
              <ImageUpload
                v-if="canEdit"
                v-model="photoUrl"
                label="Logo"
                shape="logo"
                class="shrink-0"
              />
              <img
                v-else-if="photoUrl"
                :src="photoUrl"
                alt="Logo del negocio"
                class="size-16 shrink-0 rounded-xl border border-line object-cover"
              />
            </div>

            <!-- QR de pago: lo que el cliente escanea en la carta para transferir. Sin él, el
                 checkout enseña los datos de la cuenta en texto y nada más. -->
            <div class="flex items-start justify-between gap-4 border-t border-line pt-4">
              <div class="min-w-0">
                <p class="eyebrow">QR de pago</p>
                <p class="text-steel-500">
                  Se muestra en la carta para que el cliente escanee y transfiera. Sube la
                  imagen que te da tu banco o Nequi.
                </p>
              </div>
              <ImageUpload
                v-if="canEdit"
                v-model="paymentQrUrl"
                label="QR"
                shape="logo"
                class="shrink-0"
              />
              <img
                v-else-if="paymentQrUrl"
                :src="paymentQrUrl"
                alt="QR de pago del negocio"
                class="size-16 shrink-0 rounded-xl border border-line object-contain"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-2">
                <span class="eyebrow">Nombre <span class="text-ember">*</span></span>
                <input
                  v-model="identity.name"
                  type="text"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="Ej. La Cevichería del Cabo"
                />
              </label>
              <label class="flex flex-col gap-2">
                <span class="eyebrow">NIT</span>
                <input
                  v-model="identity.taxId"
                  type="text"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="900123456-7"
                />
              </label>
              <label class="flex flex-col gap-2">
                <span class="eyebrow">Correo</span>
                <input
                  v-model="identity.email"
                  type="email"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="hola@negocio.com"
                />
              </label>
              <label class="flex flex-col gap-2">
                <span class="eyebrow">Teléfono</span>
                <input
                  v-model="identity.phone"
                  type="tel"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="3001234567"
                />
              </label>
            </div>

            <!-- Staff stat (read-only). -->
            <div class="flex w-fit items-baseline gap-2 rounded-lg border border-line bg-app px-4 py-2.5">
              <span class="font-mono text-xl font-bold text-ink">{{ profile?.staffCount ?? 0 }}</span>
              <span class="font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
                en el equipo
              </span>
            </div>
          </section>

          <!-- Branches -->
          <section
            v-for="branch in branchForms"
            :key="branch.id"
            class="card flex flex-col gap-5 p-4 sm:p-5"
          >
            <div class="flex items-center gap-2">
              <p class="eyebrow">Sucursal</p>
              <span
                v-if="branch.isPrimary"
                class="rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ember"
              >
                Principal
              </span>
            </div>
            <div class="-mt-3 grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-2">
                <span class="eyebrow">Nombre de la sucursal</span>
                <input
                  v-model="branch.name"
                  type="text"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="Sede Centro"
                  data-testid="branch-name"
                />
                <!-- Es lo que ve el cliente: la carta pública y el saludo de WhatsApp lo
                     interpolan con {branch_name}. Nace como "Main Branch". -->
                <span class="font-mono text-[10px] leading-relaxed text-steel-400">
                  Sale en la carta pública y en los mensajes de WhatsApp.
                </span>
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-2">
                <span class="eyebrow">Dirección</span>
                <input
                  v-model="branch.address"
                  type="text"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="Calle 1 # 2-3"
                />
              </label>
              <label class="flex flex-col gap-2">
                <span class="eyebrow">Teléfono</span>
                <input
                  v-model="branch.phone"
                  type="tel"
                  :disabled="!canEdit"
                  :class="inputCls"
                  placeholder="3001234567"
                />
              </label>
            </div>

            <!-- Weekly operating hours -->
            <div class="flex flex-col gap-3">
              <p class="eyebrow">Horario de atención</p>
              <div class="flex flex-col divide-y divide-line rounded-lg border border-line">
                <div
                  v-for="day in branch.days"
                  :key="day.weekday"
                  class="flex flex-wrap items-center gap-3 px-3 py-2.5"
                >
                  <span class="w-10 font-mono text-[12px] uppercase tracking-[0.14em] text-ink">
                    {{ WEEKDAYS[day.weekday] }}
                  </span>
                  <label class="flex items-center gap-2">
                    <input
                      v-model="day.isOpen"
                      type="checkbox"
                      :disabled="!canEdit"
                      class="size-4 accent-ember disabled:cursor-not-allowed"
                    />
                    <span class="font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
                      {{ day.isOpen ? 'Abierto' : 'Cerrado' }}
                    </span>
                  </label>
                  <div v-if="day.isOpen" class="flex items-center gap-2">
                    <input
                      v-model="day.open"
                      type="time"
                      :disabled="!canEdit"
                      :class="[inputCls, 'font-mono']"
                      aria-label="Hora de apertura"
                    />
                    <span class="text-steel-500">–</span>
                    <input
                      v-model="day.close"
                      type="time"
                      :disabled="!canEdit"
                      :class="[inputCls, 'font-mono']"
                      aria-label="Hora de cierre"
                    />
                  </div>
                </div>
              </div>
              <div class="flex justify-end">
                <button
                  type="button"
                  :disabled="!canEdit || savingHoursId === branch.id"
                  class="rounded-lg border border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink transition hover:bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:cursor-not-allowed disabled:opacity-60"
                  @click="saveHours(branch)"
                >
                  {{ savingHoursId === branch.id ? 'Guardando…' : 'Guardar horario' }}
                </button>
              </div>
            </div>
          </section>

          <!-- Global save (identity + branch details) -->
          <div class="sticky bottom-0 -mx-4 flex justify-end border-t border-line bg-app/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-xl lg:border lg:px-5">
            <button
              type="button"
              :disabled="!canEdit || savingProfile"
              class="rounded-lg bg-ember px-5 py-2.5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-graphite-900 transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:cursor-not-allowed disabled:opacity-60"
              @click="saveProfile"
            >
              {{ savingProfile ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </template>
      </div>
    </main>
  </AppShell>
</template>
