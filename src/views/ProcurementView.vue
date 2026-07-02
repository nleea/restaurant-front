<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import ProcurementPanel from '@/components/procurement/ProcurementPanel.vue'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · Abastecimiento
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Abastecimiento</h1>
          <p class="text-steel-500">Solicitudes, órdenes de compra, recepción y pagos.</p>
        </header>

        <ProcurementPanel />
      </div>
    </main>
  </AppShell>
</template>
