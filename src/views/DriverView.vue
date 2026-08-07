<script setup lang="ts">
// The driver ("domiciliario") view: a self-contained mobile experience — no AppShell/sidebar.
// One screen, three tabs driven by the bottom nav (Inicio / Mapa / Mi día), plus the stop detail
// as a bottom sheet. Backed by the real delivery API (the /delivery/me slice) through the driver
// store, which loads the driver's own active run on mount and mutates it write-through.
import { onMounted, onUnmounted, watch } from 'vue'
import { useDriverStore } from '@/stores/driver'
import { useBranchStore } from '@/stores/branch'
import { createGeoTracking } from '@/composables/useGeoTracking'
import DriverLayout from '@/components/driver/DriverLayout.vue'
import ActiveRun from '@/components/driver/ActiveRun.vue'
import EmptyRun from '@/components/driver/EmptyRun.vue'
import RunMap from '@/components/driver/RunMap.vue'
import DayHistory from '@/components/driver/DayHistory.vue'
import StopDetailSheet from '@/components/driver/StopDetailSheet.vue'

const driver = useDriverStore()
const branch = useBranchStore()

// Load the run, then go live: the dispatcher can change this driver's run, so the branch's
// `delivery` stream (doorbell → silent refetch, polling fallback) keeps it current. The SSE
// endpoint is branch-scoped, so resolve the active branch before subscribing.
// Live location: the browser watcher lives here (a view, so its lifecycle owns the geolocation
// API), gated on consent (driver.tracking) AND an active run. Accepted, throttled fixes flow
// back into the store, which extends the local trail and pushes them. Denial is soft.
const geo = createGeoTracking({
  isActive: () => driver.isRunActive,
  onFix: (lat, lng) => driver.recordFix(lat, lng),
  onDenied: () => driver.markTrackingDenied(),
})
watch(
  () => driver.tracking && driver.isRunActive,
  (on) => (on ? geo.enable() : geo.disable()),
)
// A new despacho (or the dispatcher swapping the run) resets the local trail so it never mixes
// two runs' paths.
watch(
  () => driver.run?.id,
  () => driver.resetTracking(),
)

onMounted(async () => {
  await driver.loadMyRun()
  await branch.ensureLoaded()
  if (branch.activeBranchId) driver.startLive(branch.activeBranchId)
})
onUnmounted(() => {
  driver.stopLive()
  geo.disable()
})
</script>

<template>
  <DriverLayout>
    <!-- Error banner: the store surfaces the server's own message (e.g. "no route assigned"). -->
    <div
      v-if="driver.error"
      class="mb-3 flex items-start gap-2 rounded-xl border border-alert/30 bg-alert/5 px-3.5 py-3 text-[13px] text-alert-600"
      role="alert"
    >
      <i class="pi pi-exclamation-triangle mt-0.5 text-sm" />
      <span class="flex-1">{{ driver.error }}</span>
      <button
        type="button"
        class="flex-none rounded-md px-1 text-alert-600/70 transition hover:text-alert-600"
        aria-label="Descartar"
        @click="driver.error = null"
      >
        <i class="pi pi-times text-xs" />
      </button>
    </div>

    <!-- Initial load: a calm spinner while the driver's run is fetched. -->
    <div v-if="driver.loading" class="flex min-h-[60dvh] flex-col items-center justify-center gap-3">
      <i class="pi pi-spin pi-spinner text-2xl text-steel-400" />
      <p class="font-mono text-[12px] text-steel-500">Cargando tu despacho…</p>
    </div>

    <template v-else>
      <!-- Inicio -->
      <template v-if="driver.tab === 'home'">
        <ActiveRun v-if="driver.hasRun" @open="driver.openStop" />
        <EmptyRun v-else />
      </template>

      <!-- Mapa -->
      <template v-else-if="driver.tab === 'map'">
        <div class="flex items-center justify-between gap-2">
          <p class="eyebrow">Mapa aproximado</p>
          <p v-if="driver.hasRun" class="font-mono text-[11px] text-steel-400">
            {{ driver.settledCount }}/{{ driver.totalCount }}
          </p>
        </div>
        <!-- Live-location consent: off by default, only while a run is active. -->
        <div
          v-if="driver.isRunActive"
          class="mt-2 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5"
        >
          <div class="min-w-0">
            <p class="text-[13px] font-medium text-ink">Compartir mi ubicación</p>
            <p class="font-mono text-[10px] text-steel-500">
              {{
                driver.trackingDenied
                  ? 'Permiso denegado en el navegador'
                  : driver.tracking
                    ? driver.myPosition
                      ? 'Transmitiendo tu posición'
                      : 'Esperando señal GPS…'
                    : 'Apagado'
              }}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="driver.tracking"
            aria-label="Compartir mi ubicación"
            class="relative h-[22px] w-10 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
            :class="driver.tracking ? 'bg-ember' : 'bg-steel-300'"
            @click="driver.tracking ? driver.disableTracking() : driver.enableTracking()"
          >
            <span
              class="absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all"
              :class="driver.tracking ? 'left-[20px]' : 'left-[2px]'"
            />
          </button>
        </div>

        <div class="mt-2">
          <RunMap
            v-if="driver.hasRun"
            :stops="driver.stops"
            :next-stop-id="driver.nextStop?.id ?? null"
            :my-position="driver.myPosition"
            :my-trail="driver.myTrail"
            @open="driver.openStop"
          />
          <p v-else class="mt-16 text-center text-sm text-muted">
            Abre un despacho para ver tus pedidos en el mapa.
          </p>
        </div>
      </template>

      <!-- Mi día -->
      <template v-else>
        <DayHistory />
      </template>
    </template>

    <!-- Stop detail (bottom sheet) -->
    <StopDetailSheet
      v-if="driver.selectedStop"
      :stop="driver.selectedStop"
      @close="driver.closeStop"
      @delivered="(id) => driver.markMyDelivered(id, true)"
      @failed="(id, reason, comment) => driver.markMyDelivered(id, false, reason, comment)"
      @unassign="driver.unassignMyDelivery"
    />
  </DriverLayout>
</template>
