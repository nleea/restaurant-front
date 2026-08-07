<script setup lang="ts">
// "Apariencia de la carta": the admin editor for the public storefront's look — theme, brand, and a
// widget grid of blocks — with a live phone preview. Desktop-first, two-pane; the El Pase chrome
// stays mono while the customer's palette blooms only inside the preview. Mock data throughout.
import { onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import SaveBar from '@/components/menu-appearance/SaveBar.vue'
import ThemePanel from '@/components/menu-appearance/ThemePanel.vue'
import BrandPanel from '@/components/menu-appearance/BrandPanel.vue'
import BlockCanvas from '@/components/menu-appearance/BlockCanvas.vue'
import HiddenBlocksTray from '@/components/menu-appearance/HiddenBlocksTray.vue'
import BlockContentPanel from '@/components/menu-appearance/BlockContentPanel.vue'
import DishCardPanel from '@/components/menu-appearance/DishCardPanel.vue'
import DishDetailPanel from '@/components/menu-appearance/DishDetailPanel.vue'
import MenuPreview from '@/components/menu-appearance/MenuPreview.vue'
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import { useMenuStore } from '@/stores/menu'
import { useBranchStore } from '@/stores/branch'

const store = useMenuAppearanceStore()
const menu = useMenuStore()
const branch = useBranchStore()

// Ref to the canvas so the tray can start a canvas drag from its own pointerdown (drag-from-tray).
const canvas = ref<InstanceType<typeof BlockCanvas> | null>(null)

type Tab = 'theme' | 'brand' | 'blocks' | 'dish'
const tab = ref<Tab>('theme')
const TABS: { id: Tab; label: string }[] = [
  { id: 'theme', label: 'Tema' },
  { id: 'brand', label: 'Marca' },
  { id: 'blocks', label: 'Bloques' },
  { id: 'dish', label: 'Plato' },
]

// Read-only load of the real menu so the preview shows this tenant's actual dishes, categories, and
// prices. The appearance store never writes menu data — it only consumes it. Failures degrade to the
// preview's own "cargando/aún no hay platos" placeholders, so this stays best-effort.
async function loadMenuData(): Promise<void> {
  try {
    await branch.ensureLoaded()
    await Promise.all([
      menu.fetchCategories(),
      menu.fetchProducts(),
      menu.fetchAddons(),
      menu.fetchIngredients(),
    ])
    if (branch.activeBranchId) await menu.loadPrices(branch.activeBranchId)
  } catch {
    /* preview falls back to its placeholder states */
  }
}

onMounted(() => {
  store.load()
  loadMenuData()
})
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-[100rem] flex-col gap-4 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="eyebrow">Estación · Carta</p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Apariencia de la carta</h1>
          <p class="text-steel-500">
            Configura cómo se ve la carta pública que abren tus clientes: colores, tipografía, marca y bloques.
          </p>
        </header>

        <!-- Always-visible save bar -->
        <div class="sticky top-0 z-20 overflow-hidden rounded-xl shadow-[0_10px_30px_-20px_rgb(20_24_28/0.5)]">
          <SaveBar />
        </div>

        <!-- Editor (left) · live preview (right) -->
        <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div class="card min-w-0 p-4 sm:p-5">
            <!-- Section tabs -->
            <nav class="flex w-fit gap-1 rounded-xl border border-line bg-app p-1">
              <button
                v-for="t in TABS"
                :key="t.id"
                type="button"
                class="rounded-lg px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                :class="tab === t.id ? 'bg-ember text-graphite-900' : 'text-steel-500 hover:text-ink'"
                @click="tab = t.id"
              >
                {{ t.label }}
              </button>
            </nav>

            <div class="mt-5">
              <ThemePanel v-if="tab === 'theme'" />
              <BrandPanel v-else-if="tab === 'brand'" />
              <div v-else-if="tab === 'blocks'" class="flex flex-col gap-6">
                <BlockCanvas ref="canvas" />
                <hr class="border-hairline" />
                <HiddenBlocksTray @grab="(id, event) => canvas?.startNewBlockDrag(id, event)" />
                <hr class="border-hairline" />
                <BlockContentPanel />
              </div>
              <div v-else class="flex flex-col gap-6">
                <DishCardPanel />
                <hr class="border-hairline" />
                <DishDetailPanel />
              </div>
            </div>
          </div>

          <!-- Preview sticks alongside as the editor scrolls -->
          <div class="lg:sticky lg:top-16 lg:self-start">
            <MenuPreview />
          </div>
        </div>
      </div>
    </main>
  </AppShell>
</template>
