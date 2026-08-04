<script setup lang="ts">
// Caja — the live cash station, wired to the real backend. The whole page swaps
// on drawer state: CERRADA is the apertura hero + historial; ABIERTA is the live
// station (KPIs · movement tape · running arqueo docket). Data comes from the
// cash / branch / staff stores via the `cashStation` adapter; the visual design
// is unchanged from the redesign prototype.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import MoneyTicker from '@/components/cashstation/MoneyTicker.vue'
import OpenDrawer from '@/components/cashstation/OpenDrawer.vue'
import HistoryPanel from '@/components/cashstation/HistoryPanel.vue'
import MovementFeed from '@/components/cashstation/MovementFeed.vue'
import ShiftSummary from '@/components/cashstation/ShiftSummary.vue'
import MovementDialog from '@/components/cashstation/MovementDialog.vue'
import CloseDialog from '@/components/cashstation/CloseDialog.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useCashStore } from '@/stores/cash'
import { useStaffStore } from '@/stores/staff'
import { cash, summary, refresh, markFresh, humanDuration, type MovementKind } from '@/lib/cashStation'

const auth = useAuthStore()
const branch = useBranchStore()
const cashStore = useCashStore()
const staff = useStaffStore()

const canOpen = computed(() => auth.can('cash.open'))
const canMove = computed(() => auth.can('cash.move'))
const canClose = computed(() => auth.can('cash.close'))

const loading = ref(false)
const error = ref<string | null>(null)

const open = computed(() => cash.status === 'ABIERTA')
// The KPI strip + channel/method sections degrade gracefully when the summary is unavailable.
const hasSummary = computed(() => cashStore.currentSummary !== null)

// ── Load like CashPanel: branch → open session + history + staff directory ──
async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await Promise.all([
        cashStore.loadBranchCash(branch.activeBranchId),
        cashStore.loadHistory(branch.activeBranchId),
        staff.ensureLoaded({ branchId: branch.activeBranchId, active: true }),
      ])
    }
  } catch {
    error.value = 'No se pudo cargar la caja.'
  } finally {
    loading.value = false
  }
}

// Live clock: tick once every 30s so the elapsed counter and KPIs stay current.
const nowTick = ref(Date.now())
const elapsed = computed(() => humanDuration(nowTick.value - new Date(cash.openedAt).getTime()))
const openedTime = computed(() =>
  new Date(cash.openedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }),
)

let clock: ReturnType<typeof setInterval> | undefined
let poller: ReturnType<typeof setInterval> | undefined

// Poll the open session (~15s): reload from the backend and flash any movements whose id
// wasn't in the previous tape (the "live receipt roll" affordance).
async function poll() {
  if (!open.value || loading.value) return
  const before = new Set(cash.movements.map((m) => m.id))
  await refresh()
  const arrived = cash.movements.map((m) => m.id).filter((id) => !before.has(id))
  if (arrived.length) markFresh(arrived)
}

onMounted(async () => {
  await load()
  clock = setInterval(() => (nowTick.value = Date.now()), 30_000)
  poller = setInterval(poll, 15_000)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  clearInterval(poller)
})

// Re-scope everything when the active branch changes.
watch(
  () => branch.activeBranchId,
  () => {
    cashStore.selectedSessionId = null
    cashStore.selectedSession = null
    void load()
  },
)

// Dialogs
const moveKind = ref<Extract<MovementKind, 'entry' | 'withdrawal' | 'expense'> | null>(null)
const showClose = ref(false)

// Toasts (bottom-right, 3s auto-dismiss)
interface Toast { id: number; text: string; tone: 'success' | 'alert' }
const toasts = ref<Toast[]>([])
let toastSeq = 0
function toast(text: string, tone: Toast['tone'] = 'success') {
  const id = ++toastSeq
  toasts.value.push({ id, text, tone })
  setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), 3000)
}

function onMovementDone(text: string) {
  moveKind.value = null
  toast(text)
}
function onClosed() {
  showClose.value = false
  toast(`Caja cerrada correctamente · ${openedTime.value}`)
}

const kpis = computed(() => [
  { label: 'Ventas hoy', value: summary.totalIn.value, money: true, tone: 'text-success-600', sub: 'ingresos del turno', icon: 'pi-arrow-up-right' },
  { label: 'Tickets', value: cash.ticketsDone, money: false, tone: 'text-ink', sub: `${cash.ticketsOpen} abiertos ahora`, icon: 'pi-receipt' },
  { label: 'Efectivo en caja', value: summary.expectedCash.value, money: true, tone: 'text-ember-600', sub: 'estimado', icon: 'pi-wallet' },
  { label: 'Ticket promedio', value: summary.ticketAvg.value, money: true, tone: 'text-ink', sub: 'promedio del turno', icon: 'pi-chart-line' },
])
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <!-- Header — gains the live status + soft ember glow when open -->
        <header
          class="flex flex-wrap items-start justify-between gap-4 rounded-2xl px-1 py-1 transition"
          :class="open && 'header-lit'"
        >
          <div class="min-w-0">
            <p class="eyebrow">Estación · Caja</p>
            <h1 class="mt-1 font-display text-hero font-bold text-ink">Caja</h1>
            <p class="text-steel-500">Apertura, movimientos y arqueo de la sucursal activa.</p>
          </div>

          <div v-if="open" class="flex flex-col items-end gap-1.5 text-right">
            <span class="pill pill-warn border-ember/30 bg-ember-50 text-ember-600">
              <span class="relative flex size-1.5">
                <span class="absolute inline-flex size-full animate-ping rounded-full bg-ember/70" />
                <span class="relative inline-flex size-1.5 rounded-full bg-ember" />
              </span>
              Abierta
            </span>
            <p class="font-mono text-[12px] text-steel-600">
              {{ cash.cashier.name }} · desde {{ openedTime }}
            </p>
            <p class="flex items-center gap-1 font-mono text-[11px] text-steel-500">
              <i class="pi pi-clock text-[10px]" /> {{ elapsed }} abierta
            </p>
            <button
              v-if="canClose"
              type="button"
              class="mt-0.5 inline-flex items-center gap-1.5 rounded-lg border border-alert/30 px-2.5 py-1 font-mono text-[11px] text-alert-600 transition hover:bg-alert/8"
              @click="showClose = true"
            >
              <i class="pi pi-lock text-[10px]" /> Cerrar caja
            </button>
          </div>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-steel-600 transition hover:bg-sunken disabled:opacity-40"
            :disabled="loading || !branch.hasActiveBranch"
            @click="load"
          >
            <i :class="['pi text-[11px]', loading ? 'pi-spin pi-spinner' : 'pi-refresh']" /> Actualizar
          </button>
        </header>

        <!-- Error / no-branch / loading states -->
        <p
          v-if="error"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert-600"
        >
          {{ error }}
        </p>
        <p
          v-else-if="!branch.hasActiveBranch && !loading"
          class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
        >
          Esta cuenta aún no tiene sucursales.
        </p>

        <div v-if="loading" class="text-steel-500">Cargando la caja…</div>

        <template v-else-if="branch.hasActiveBranch">
          <!-- ── STATE A · CERRADA ─────────────────────────────────────────── -->
          <template v-if="!open">
            <OpenDrawer v-if="canOpen" @opened="toast('Caja abierta correctamente')" />
            <HistoryPanel />
          </template>

          <!-- ── STATE B · ABIERTA ─────────────────────────────────────────── -->
          <template v-else>
            <!-- Zona A · KPI strip (hidden when the shift summary is unavailable) -->
            <div v-if="hasSummary" class="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">
              <div v-for="k in kpis" :key="k.label" class="card flex min-w-[13rem] flex-col gap-2 p-5 sm:min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <span class="eyebrow truncate">{{ k.label }}</span>
                  <i :class="['pi', k.icon, 'shrink-0 text-sm text-steel-400']" />
                </div>
                <span class="font-mono text-2xl font-bold leading-none tabular-nums lg:text-3xl" :class="k.tone">
                  <template v-if="k.money">$</template><MoneyTicker :value="k.value" :format="k.money ? (n) => Math.round(n).toLocaleString('es-CO') : (n) => String(Math.round(n))" />
                </span>
                <span class="font-mono text-[11px] text-steel-500">{{ k.sub }}</span>
              </div>
            </div>

            <!-- Zona B + C -->
            <div class="grid gap-5 lg:grid-cols-[1.25fr_1fr] lg:items-start">
              <MovementFeed class="max-h-[68vh]" :can-register="canMove" @register="moveKind = $event" />
              <ShiftSummary :can-close="canClose" @close="showClose = true" />
            </div>
          </template>
        </template>
      </div>
    </main>

    <!-- Dialogs -->
    <MovementDialog v-if="moveKind" :kind="moveKind" @close="moveKind = null" @done="onMovementDone" />
    <CloseDialog v-if="showClose" @close="showClose = false" @done="onClosed" />

    <!-- Toasts -->
    <div class="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          :class="t.tone === 'success' ? 'bg-success-600' : 'bg-alert-600'"
        >
          <i :class="['pi', t.tone === 'success' ? 'pi-check-circle' : 'pi-times-circle', 'text-sm']" />
          {{ t.text }}
        </div>
      </TransitionGroup>
    </div>
  </AppShell>
</template>

<style scoped>
/* The station is live: the header sits under a faint heat-lamp wash. */
.header-lit {
  box-shadow: 0 -1px 0 0 transparent, 0 18px 40px -34px color-mix(in oklab, var(--color-ember) 80%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--color-ember) 6%, transparent), transparent 70%);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.2, 0.7, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
