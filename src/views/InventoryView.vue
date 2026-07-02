<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import InventoryPanel from '@/components/inventory/InventoryPanel.vue'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · Inventario
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Inventario</h1>
          <p class="text-steel-500">Existencias, movimientos y recuentos de la sucursal activa.</p>
        </header>

        <InventoryPanel />
      </div>
    </main>
  </AppShell>
</template>
