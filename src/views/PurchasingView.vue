<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import SuppliersPanel from '@/components/purchasing/SuppliersPanel.vue'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · Compras
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Proveedores</h1>
          <p class="text-steel-500">Proveedores y su catálogo de ingredientes.</p>
        </header>

        <SuppliersPanel />
      </div>
    </main>
  </AppShell>
</template>
