<script setup lang="ts">
// No despacho open — the driver is free. One job: open a run. If the driver drives a single
// route, that's one tap; if they drive several, the backend needs to know which, so we show a
// route picker here (fetched from /delivery/me/routes) instead of dead-ending on the error.
import { computed, onMounted } from 'vue'
import { useDriverStore } from '@/stores/driver'

const driver = useDriverStore()

onMounted(() => {
  if (!driver.routesLoaded) void driver.loadMyRoutes()
})

const mustChoose = computed(() => driver.myRoutes.length > 1)
</script>

<template>
  <div class="flex min-h-[60dvh] flex-col items-center justify-center text-center">
    <span class="grid size-16 place-items-center rounded-2xl border border-line bg-paper text-steel-400 shadow-[0_10px_30px_-20px_rgba(20,24,28,0.5)]">
      <i class="pi pi-inbox text-2xl" />
    </span>
    <h2 class="mt-5 font-display text-hero font-extrabold text-ink">Sin despacho abierto</h2>

    <!-- Several routes: pick which one this despacho rides on. -->
    <template v-if="mustChoose">
      <p class="mt-2 max-w-[18rem] text-sm text-muted">
        Conduces varias rutas. Elige la ruta con la que sales a repartir.
      </p>
      <div class="mt-5 flex w-full max-w-xs flex-col gap-2">
        <button
          v-for="route in driver.myRoutes"
          :key="route.id"
          type="button"
          class="flex min-h-13 w-full items-center justify-between gap-3 rounded-xl border border-line bg-paper px-4 text-left transition hover:border-ember/50 hover:bg-ember-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          @click="driver.openMyRun(route.id)"
        >
          <span class="min-w-0">
            <span class="block truncate font-display text-[15px] font-bold text-ink">{{ route.name }}</span>
            <span v-if="route.zones.length" class="block truncate font-mono text-[11px] text-steel-500">
              {{ route.zones.join(' · ') }}
            </span>
          </span>
          <i class="pi pi-arrow-right flex-none text-sm text-ember-600" />
        </button>
      </div>
    </template>

    <!-- One route (or none — the backend answers with a clear message): single action. -->
    <template v-else>
      <p class="mt-2 max-w-[16rem] text-sm text-muted">
        Abre un despacho para avisar que estás disponible y recibir tus pedidos.
      </p>
      <button
        type="button"
        class="mt-6 flex min-h-13 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
        @click="driver.openMyRun()"
      >
        <i class="pi pi-play-circle text-base" /> Abrir despacho
      </button>
    </template>
  </div>
</template>
