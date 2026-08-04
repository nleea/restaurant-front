<script setup lang="ts">
// Lightweight content editors for the new blocks (promo / hours / testimonials). Gallery has no text
// — its photos come from the carta's products — so it only shows an info note. Everything writes
// through updateBlockContent so the preview updates live and the content travels with draft/published.
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import type { HoursRow, Testimonial } from '@/lib/menuAppearance'
import ImageUpload from '@/components/ImageUpload.vue'

const store = useMenuAppearanceStore()

const inputCls =
  'w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] text-ink focus:border-ember focus:outline-none'

function setHoursRow(i: number, patch: Partial<HoursRow>): void {
  const rows = store.blockContent.hours.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
  store.updateBlockContent('hours', { rows })
}
function addHoursRow(): void {
  store.updateBlockContent('hours', { rows: [...store.blockContent.hours.rows, { label: '', value: '' }] })
}
function removeHoursRow(i: number): void {
  store.updateBlockContent('hours', { rows: store.blockContent.hours.rows.filter((_, idx) => idx !== i) })
}

function setTestimonial(i: number, patch: Partial<Testimonial>): void {
  const items = store.blockContent.testimonials.items.map((t, idx) => (idx === i ? { ...t, ...patch } : t))
  store.updateBlockContent('testimonials', { items })
}
function addTestimonial(): void {
  store.updateBlockContent('testimonials', {
    items: [...store.blockContent.testimonials.items, { author: '', quote: '' }],
  })
}
function removeTestimonial(i: number): void {
  store.updateBlockContent('testimonials', {
    items: store.blockContent.testimonials.items.filter((_, idx) => idx !== i),
  })
}
</script>

<template>
  <section class="flex flex-col gap-6">
    <!-- Promo -->
    <div class="flex flex-col gap-2">
      <p class="eyebrow">Promoción</p>
      <input
        :value="store.blockContent.promo.title"
        :class="inputCls"
        placeholder="Título (ej. Plato del día)"
        @input="store.updateBlockContent('promo', { title: ($event.target as HTMLInputElement).value })"
      />
      <textarea
        :value="store.blockContent.promo.body"
        rows="2"
        :class="[inputCls, 'resize-none']"
        placeholder="Texto de la promoción"
        @input="store.updateBlockContent('promo', { body: ($event.target as HTMLTextAreaElement).value })"
      />
      <ImageUpload
        label="Imagen (opcional)"
        shape="banner"
        :model-value="store.blockContent.promo.imageUrl"
        @update:model-value="store.updateBlockContent('promo', { imageUrl: $event })"
      />
    </div>

    <hr class="border-hairline" />

    <!-- Hours -->
    <div class="flex flex-col gap-2">
      <p class="eyebrow">Horario</p>
      <div v-for="(r, i) in store.blockContent.hours.rows" :key="i" class="flex items-center gap-2">
        <input :value="r.label" :class="inputCls" placeholder="Días" @input="setHoursRow(i, { label: ($event.target as HTMLInputElement).value })" />
        <input :value="r.value" :class="inputCls" placeholder="Horas" @input="setHoursRow(i, { value: ($event.target as HTMLInputElement).value })" />
        <button type="button" class="shrink-0 text-steel-400 transition hover:text-alert" aria-label="Quitar fila" @click="removeHoursRow(i)">
          <i class="pi pi-times text-[11px]" />
        </button>
      </div>
      <button type="button" class="w-fit rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-steel-500 transition hover:text-ember" @click="addHoursRow">
        <i class="pi pi-plus text-[9px]" /> Añadir fila
      </button>
    </div>

    <hr class="border-hairline" />

    <!-- Testimonials -->
    <div class="flex flex-col gap-2">
      <p class="eyebrow">Testimonios</p>
      <div v-for="(t, i) in store.blockContent.testimonials.items" :key="i" class="flex flex-col gap-1.5 rounded-lg border border-line p-2.5">
        <div class="flex items-center gap-2">
          <input :value="t.author" :class="inputCls" placeholder="Autor" @input="setTestimonial(i, { author: ($event.target as HTMLInputElement).value })" />
          <button type="button" class="shrink-0 text-steel-400 transition hover:text-alert" aria-label="Quitar testimonio" @click="removeTestimonial(i)">
            <i class="pi pi-times text-[11px]" />
          </button>
        </div>
        <textarea :value="t.quote" rows="2" :class="[inputCls, 'resize-none']" placeholder="Reseña" @input="setTestimonial(i, { quote: ($event.target as HTMLTextAreaElement).value })" />
      </div>
      <button type="button" class="w-fit rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-steel-500 transition hover:text-ember" @click="addTestimonial">
        <i class="pi pi-plus text-[9px]" /> Añadir testimonio
      </button>
    </div>

    <hr class="border-hairline" />

    <!-- Gallery (info only) -->
    <div class="flex flex-col gap-1">
      <p class="eyebrow">Galería</p>
      <p class="text-[12px] text-muted">
        Las fotos de la galería salen de los platos de tu carta (todos los que tengan imagen). Súbelas
        desde la carta, en cada producto.
      </p>
    </div>
  </section>
</template>
