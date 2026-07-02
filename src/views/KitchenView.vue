<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useKitchenStore } from '@/stores/kitchen'
import KdsPass from '@/components/kds/KdsPass.vue'
import KitchenSetup from '@/components/kitchen/KitchenSetup.vue'
import KitchenRouting from '@/components/kitchen/KitchenRouting.vue'

const auth = useAuthStore()
const branch = useBranchStore()
const kitchen = useKitchenStore()

const canUpdate = computed(() => auth.can('kitchen.update'))

type Area = 'board' | 'setup' | 'routing'
const area = ref<Area>('board')
const areas = computed(() => {
  const tabs: { value: Area; label: string }[] = [{ value: 'board', label: 'Pase' }]
  if (canUpdate.value) {
    tabs.push({ value: 'setup', label: 'Configuración' }, { value: 'routing', label: 'Ruteo' })
  }
  return tabs
})

const loading = ref(false)
const error = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    await branch.ensureLoaded()
    if (branch.activeBranchId) {
      await kitchen.loadStations(branch.activeBranchId)
      await kitchen.buildItemIndex(branch.activeBranchId)
      await kitchen.loadAllStationTickets()
      // Setup still works against a selected station; default it so its forms aren't empty.
      if (!kitchen.selectedStationId && kitchen.stations[0]) {
        kitchen.selectedStationId = kitchen.stations[0].id
      }
    }
  } catch {
    error.value = 'No se pudo cargar la cocina.'
  } finally {
    loading.value = false
  }
}

// The wall board refreshes itself while mounted: SSE events when the stream is healthy, polling
// as fallback (the store swaps cadences). Both are re-keyed to the active branch.
function restartLive() {
  kitchen.stopEvents()
  kitchen.stopPolling()
  if (branch.activeBranchId) {
    kitchen.startPolling(branch.activeBranchId)
    kitchen.startEvents(branch.activeBranchId)
  }
}

onMounted(async () => {
  await load()
  restartLive()
})
onUnmounted(() => {
  kitchen.stopEvents()
  kitchen.stopPolling()
})

watch(
  () => branch.activeBranchId,
  async () => {
    kitchen.selectedStationId = null
    await load()
    restartLive()
  },
)
</script>

<template>
  <AppShell>
    <!-- The pass: the kitchen screen lives under the heat lamp, so it keeps the dark field of the
         login docket rather than the light working surface of the office screens. -->
    <main class="bg-pass min-h-screen">
      <div
        class="mx-auto flex flex-col gap-6 p-4 sm:p-6 lg:p-8"
        :class="area === 'board' ? 'max-w-[1600px] pb-0 sm:pb-0 lg:pb-0' : 'max-w-6xl'"
      >
        <header class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-ember">
              El pase · Cocina
            </p>
            <h1 class="mt-1 font-display text-2xl font-extrabold text-paper">Estación de cocina</h1>
            <p class="mt-0.5 text-sm text-paper/55">
              Comandas en vivo — el pase se actualiza solo (eventos en tiempo real).
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/70 transition hover:bg-white/[0.08] hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:opacity-50"
            :disabled="loading"
            @click="load"
          >
            <i class="pi pi-refresh text-xs" :class="loading ? 'animate-spin' : ''" />
            Actualizar
          </button>
        </header>

        <p
          v-if="error"
          role="alert"
          class="rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ error }}
        </p>
        <p
          v-else-if="!branch.hasActiveBranch"
          class="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 font-mono text-[11px] text-paper/55"
        >
          Esta cuenta aún no tiene sucursales.
        </p>

        <!-- Area switch -->
        <nav
          v-if="areas.length > 1"
          class="flex w-fit gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
        >
          <button
            v-for="t in areas"
            :key="t.value"
            type="button"
            class="rounded-lg px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :class="
              area === t.value
                ? 'bg-ember text-graphite-900'
                : 'text-paper/55 hover:text-paper'
            "
            @click="area = t.value"
          >
            {{ t.label }}
          </button>
        </nav>

        <p v-if="loading" class="font-mono text-[12px] text-paper/55">Cargando el pase…</p>
        <template v-else>
          <!-- Config is framed as a paper docket on the pass, so its forms keep the light surface
               the rest of the app's inputs were designed for. -->
          <div
            v-if="area === 'setup' && canUpdate"
            class="overflow-hidden rounded-2xl bg-paper shadow-[0_24px_60px_-24px_rgb(0_0_0/0.55)] ring-1 ring-black/5"
          >
            <div class="docket-perf h-2 w-full" />
            <div class="p-4 sm:p-5">
              <KitchenSetup />
            </div>
          </div>

          <div
            v-else-if="area === 'routing' && canUpdate"
            class="overflow-hidden rounded-2xl bg-paper shadow-[0_24px_60px_-24px_rgb(0_0_0/0.55)] ring-1 ring-black/5"
          >
            <div class="docket-perf h-2 w-full" />
            <div class="p-4 sm:p-5">
              <KitchenRouting />
            </div>
          </div>
        </template>
      </div>

      <!-- The KDS board runs full-bleed below the header so its sticky chrome and grid own the
           viewport width. -->
      <KdsPass v-if="!loading && area === 'board' && branch.hasActiveBranch" />
    </main>
  </AppShell>
</template>
