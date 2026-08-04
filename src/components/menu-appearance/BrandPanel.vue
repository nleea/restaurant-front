<script setup lang="ts">
// "Marca": restaurant name + logo + banner. Name is a plain input; logo/banner upload to
// Cloudflare R2 (real, durable URLs) via the shared ImageUpload. All write through to the store
// draft so the preview reflects them at once; saving the appearance persists the URLs.
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import ImageUpload from '@/components/ImageUpload.vue'

const store = useMenuAppearanceStore()

function onName(event: Event) {
  store.updateBrand({ restaurantName: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <section class="flex flex-col gap-5">
    <label class="flex flex-col gap-2">
      <span class="eyebrow">Nombre del restaurante</span>
      <input
        type="text"
        :value="store.brand.restaurantName"
        placeholder="Ej. La Cevichería del Cabo"
        class="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @input="onName"
      />
    </label>

    <hr class="border-hairline" />

    <ImageUpload
      label="Logo"
      shape="logo"
      :model-value="store.brand.logoUrl"
      @update:model-value="store.updateBrand({ logoUrl: $event })"
    />
    <ImageUpload
      label="Banner"
      shape="banner"
      :model-value="store.brand.bannerUrl"
      @update:model-value="store.updateBrand({ bannerUrl: $event })"
    />
    <p class="text-[11px] leading-snug text-muted">
      Las imágenes se suben a tu almacenamiento (R2). Recuerda guardar la apariencia para
      publicar los cambios.
    </p>
  </section>
</template>
