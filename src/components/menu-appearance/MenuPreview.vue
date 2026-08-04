<script setup lang="ts">
// Live preview of the public "carta": a restrained phone frame (the storefront is mobile-first) that
// renders the DRAFT config in real time, now fed by REAL menu data (categories/products/prices from
// the menu store) instead of hardcoded samples. The customer's palette + font are applied as scoped
// CSS variables so color blooms only inside the screen — the El Pase admin chrome around it stays
// mono. Blocks render in gridToLinearOrder(); tapping a dish flips the same frame to a dish-detail
// preview with a back affordance (nothing in the carta is lost — it's derived from the store).
import { computed, ref } from 'vue'
import { fontStack, gridToLinearOrder } from '@/lib/menuAppearance'
import { formatCOP } from '@/lib/money'
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import { useMenuStore } from '@/stores/menu'
import DishCardPreview from './DishCardPreview.vue'
import DishDetailPreview from './DishDetailPreview.vue'

const store = useMenuAppearanceStore()
const menu = useMenuStore()

const orderedBlocks = computed(() => gridToLinearOrder(store.draft.blocks))

const screenStyle = computed(() => {
  const t = store.draft.theme
  return {
    backgroundColor: t.backgroundColor,
    color: t.textColor,
    fontFamily: fontStack(t.fontFamily),
    '--menu-primary': t.primaryColor,
    '--menu-secondary': t.secondaryColor,
    '--menu-accent': t.accentColor,
    '--menu-text': t.textColor,
  } as Record<string, string>
})

// --- Real menu data ------------------------------------------------------------------------
const loaded = computed(() => menu.products.length > 0)
const activeCategories = computed(() => menu.categories.filter((c) => c.is_active))
const activeProducts = computed(() => menu.products.filter((p) => p.is_active))
// [{ cat, items }] in category order, non-empty groups only.
const grouped = computed(() =>
  activeCategories.value
    .map((c) => ({ cat: c, items: activeProducts.value.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.items.length > 0),
)
// Products that carry a photo — the natural source for the gallery block (can be several).
const galleryPhotos = computed(() => {
  const fromProducts = activeProducts.value.map((p) => p.image_url).filter((u): u is string => !!u)
  return [...fromProducts, ...store.blockContent.gallery.imageUrls]
})

function tagOf(name: string): string {
  return name.slice(0, 2).toUpperCase() || '··'
}
function priceLabel(id: string): string {
  return formatCOP(menu.priceByProductId[id] ?? '')
}

// Card addon/removable hints are illustrative in the preview (per-product addon/recipe data isn't
// bulk-loaded); real per-product accuracy lives in the dish-detail preview and the storefront.
const hintsAvailable = computed(() => menu.addons.length > 0 || menu.ingredients.length > 0)

// --- Mode: carta ⇄ dish detail (same frame) ------------------------------------------------
const selectedProductId = ref<string | null>(null)
function open(id: string): void {
  selectedProductId.value = id
}
function back(): void {
  selectedProductId.value = null
}
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <p class="eyebrow">Vista previa · lo que verá tu cliente</p>

    <!-- Phone: thin graphite bezel, no skeuomorphic clutter. -->
    <div class="w-[302px] rounded-[2.2rem] border border-graphite-700 bg-graphite-900 p-2.5 shadow-[0_30px_60px_-30px_rgb(20_24_28/0.7)]">
      <div class="relative h-[600px] overflow-hidden rounded-[1.6rem]">
        <!-- notch hint -->
        <div class="absolute left-1/2 top-0 z-20 h-4 w-24 -translate-x-1/2 rounded-b-xl bg-graphite-900" />

        <div class="flex h-full flex-col" :style="screenStyle">
          <!-- Detail-mode top bar: back without losing the carta -->
          <div
            v-if="selectedProductId"
            class="z-10 flex items-center gap-2 px-3 py-2.5"
            :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-text) 6%, transparent)' }"
          >
            <button type="button" class="flex items-center gap-1 text-[13px] font-medium" @click="back">
              <i class="pi pi-chevron-left text-[12px]" />
              Volver
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <!-- DISH DETAIL -->
            <DishDetailPreview v-if="selectedProductId" :product-id="selectedProductId" />

            <!-- CARTA -->
            <template v-else>
              <div v-for="block in orderedBlocks" :key="block.id">
                <!-- Banner -->
                <div v-if="block.id === 'banner'" class="relative">
                  <img v-if="store.brand.bannerUrl" :src="store.brand.bannerUrl" alt="" class="h-40 w-full object-cover" />
                  <div
                    v-else
                    class="h-40 w-full"
                    :style="{ background: `linear-gradient(135deg, var(--menu-primary), var(--menu-secondary))` }"
                  />
                  <div class="absolute inset-0 flex flex-col items-center justify-end gap-2 bg-black/15 px-4 pb-4 text-center">
                    <img
                      v-if="store.brand.logoUrl"
                      :src="store.brand.logoUrl"
                      alt=""
                      class="size-12 rounded-full border-2 border-white/80 object-cover shadow"
                    />
                    <h2 class="text-[22px] font-bold leading-tight text-white drop-shadow">
                      {{ store.brand.restaurantName || 'Tu restaurante' }}
                    </h2>
                  </div>
                </div>

                <!-- Featured categories (real) -->
                <div v-else-if="block.id === 'featured_categories'" class="px-4 pt-4">
                  <div class="flex gap-2 overflow-x-auto">
                    <span
                      v-for="c in activeCategories"
                      :key="c.id"
                      class="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium"
                      :style="{ backgroundColor: 'var(--menu-accent)', color: '#fff' }"
                    >
                      {{ c.name }}
                    </span>
                    <span v-if="!activeCategories.length" class="text-[12px] opacity-50">Sin categorías aún.</span>
                  </div>
                </div>

                <!-- Search -->
                <div v-else-if="block.id === 'search'" class="px-4 pt-4">
                  <div
                    class="flex items-center gap-2 rounded-full border px-3 py-2.5"
                    :style="{ borderColor: 'color-mix(in oklab, var(--menu-text) 18%, transparent)' }"
                  >
                    <i class="pi pi-search text-[13px]" :style="{ color: 'var(--menu-primary)' }" />
                    <span class="text-[13px] opacity-55">Buscar platos…</span>
                  </div>
                </div>

                <!-- Full menu (real products, styled per dishCard) -->
                <div v-else-if="block.id === 'full_menu'" class="px-4 pt-5">
                  <div v-if="!loaded" class="py-6 text-center text-[12px] opacity-50">Cargando la carta…</div>
                  <div v-else-if="!grouped.length" class="py-6 text-center text-[12px] opacity-50">
                    Aún no hay platos publicados.
                  </div>
                  <template v-else>
                    <section v-for="g in grouped" :key="g.cat.id" class="mb-4">
                      <h3 class="mb-2 text-[15px] font-bold" :style="{ color: 'var(--menu-primary)' }">{{ g.cat.name }}</h3>
                      <div
                        :class="store.dishCard.style === 'grid' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'"
                      >
                        <DishCardPreview
                          v-for="p in g.items"
                          :key="p.id"
                          :name="p.name"
                          :description="p.description ?? ''"
                          :image-url="p.image_url ?? ''"
                          :price="priceLabel(p.id)"
                          :tag="tagOf(p.name)"
                          :has-addons="hintsAvailable"
                          :has-removable="hintsAvailable"
                          :config="store.dishCard"
                          @open="open(p.id)"
                        />
                      </div>
                    </section>
                  </template>
                </div>

                <!-- Promo -->
                <div v-else-if="block.id === 'promo'" class="px-4 pt-4">
                  <div class="overflow-hidden rounded-xl" :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-primary) 12%, transparent)' }">
                    <img v-if="store.blockContent.promo.imageUrl" :src="store.blockContent.promo.imageUrl" alt="" class="h-24 w-full object-cover" />
                    <div class="p-3">
                      <p class="text-[14px] font-bold" :style="{ color: 'var(--menu-primary)' }">{{ store.blockContent.promo.title }}</p>
                      <p class="mt-0.5 text-[12px] opacity-70">{{ store.blockContent.promo.body }}</p>
                    </div>
                  </div>
                </div>

                <!-- Hours -->
                <div v-else-if="block.id === 'hours'" class="px-4 pt-4">
                  <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Horario</p>
                  <div class="flex flex-col gap-1">
                    <div v-for="(r, i) in store.blockContent.hours.rows" :key="i" class="flex justify-between text-[13px]">
                      <span class="opacity-70">{{ r.label }}</span>
                      <span class="font-medium">{{ r.value }}</span>
                    </div>
                  </div>
                </div>

                <!-- Gallery (real product photos, several supported) -->
                <div v-else-if="block.id === 'gallery'" class="px-4 pt-4">
                  <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Galería</p>
                  <div v-if="galleryPhotos.length" class="flex gap-2 overflow-x-auto">
                    <img
                      v-for="(u, i) in galleryPhotos"
                      :key="i"
                      :src="u"
                      alt=""
                      class="h-24 w-24 shrink-0 rounded-lg object-cover"
                    />
                  </div>
                  <div v-else class="flex gap-2">
                    <div
                      v-for="i in 3"
                      :key="i"
                      class="grid h-24 w-24 shrink-0 place-items-center rounded-lg"
                      :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-text) 8%, transparent)' }"
                    >
                      <i class="pi pi-image text-[16px] opacity-40" />
                    </div>
                  </div>
                </div>

                <!-- Testimonials -->
                <div v-else-if="block.id === 'testimonials'" class="px-4 pt-4">
                  <p class="mb-1.5 text-[12px] font-semibold uppercase tracking-wide opacity-55">Testimonios</p>
                  <div class="flex flex-col gap-2">
                    <figure
                      v-for="(t, i) in store.blockContent.testimonials.items"
                      :key="i"
                      class="rounded-lg p-3"
                      :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-text) 6%, transparent)' }"
                    >
                      <blockquote class="text-[13px] italic opacity-80">“{{ t.quote }}”</blockquote>
                      <figcaption class="mt-1 text-[11px] font-semibold opacity-60">— {{ t.author }}</figcaption>
                    </figure>
                  </div>
                </div>

                <!-- Footer -->
                <div
                  v-else-if="block.id === 'footer'"
                  class="mt-5 px-4 py-5 text-center"
                  :style="{ backgroundColor: 'color-mix(in oklab, var(--menu-text) 6%, transparent)' }"
                >
                  <p class="text-[13px] font-semibold">{{ store.brand.restaurantName || 'Tu restaurante' }}</p>
                  <p class="mt-1 text-[11px] opacity-60">Lun–Dom · 11:00–22:00</p>
                  <div class="mt-2 flex justify-center gap-3 opacity-70">
                    <i class="pi pi-whatsapp text-[13px]" />
                    <i class="pi pi-instagram text-[13px]" />
                    <i class="pi pi-map-marker text-[13px]" />
                  </div>
                </div>
              </div>

              <div v-if="!orderedBlocks.length" class="grid h-full place-items-center px-6 text-center text-[13px] opacity-60">
                No hay bloques visibles. Añade alguno desde la bandeja.
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
