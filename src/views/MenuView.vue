<script setup lang="ts">
import { ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import CategoriesPanel from '@/components/menu/CategoriesPanel.vue'
import ProductsPanel from '@/components/menu/ProductsPanel.vue'
import AddonsPanel from '@/components/menu/AddonsPanel.vue'

type Tab = 'products' | 'categories' | 'addons'
const tab = ref<Tab>('products')
const tabs: { id: Tab; label: string }[] = [
  { id: 'products', label: 'Productos' },
  { id: 'categories', label: 'Categorías' },
  { id: 'addons', label: 'Adiciones' },
]
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
    <div class="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header class="min-w-0">
        <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
          Estación · Carta
        </p>
        <h1 class="mt-1 text-2xl font-extrabold text-ink">Carta</h1>
        <p class="text-steel-500">Productos, categorías y adiciones.</p>
      </header>

      <!-- Tabs: station-label segmented control, sticky so it stays reachable while scrolling. -->
      <div class="sticky top-14 z-10 -mx-4 bg-app px-4 py-2 sm:-mx-6 sm:px-6 lg:static lg:top-0 lg:mx-0 lg:px-0 lg:py-0">
        <div class="inline-flex w-fit gap-1 rounded-lg border border-line bg-paper p-1">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="rounded-md px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="tab === t.id ? 'bg-graphite-900 text-paper' : 'text-steel-500 hover:text-ink'"
            @click="tab = t.id"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <ProductsPanel v-if="tab === 'products'" />
      <CategoriesPanel v-else-if="tab === 'categories'" />
      <AddonsPanel v-else />
    </div>
    </main>
  </AppShell>
</template>
