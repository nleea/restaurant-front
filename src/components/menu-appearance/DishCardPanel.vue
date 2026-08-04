<script setup lang="ts">
// "Plato · Tarjeta": the global card style + which product fields show on every dish. One tenant-wide
// choice — set once, all dishes inherit. Writes straight through to the store draft so the preview
// restyles live.
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import type { DishCardStyle } from '@/lib/menuAppearance'

const store = useMenuAppearanceStore()

const STYLES: { id: DishCardStyle; label: string; icon: string }[] = [
  { id: 'list', label: 'Lista', icon: 'pi-list' },
  { id: 'card', label: 'Tarjeta', icon: 'pi-id-card' },
  { id: 'grid', label: 'Mosaico', icon: 'pi-th-large' },
  { id: 'hero', label: 'Destacado', icon: 'pi-image' },
]

const FIELDS: { key: 'image' | 'description' | 'price' | 'addonHint' | 'removableHint'; label: string }[] = [
  { key: 'image', label: 'Foto del plato' },
  { key: 'description', label: 'Descripción' },
  { key: 'price', label: 'Precio' },
  { key: 'addonHint', label: 'Aviso de adiciones' },
  { key: 'removableHint', label: 'Aviso "personalizable"' },
]
</script>

<template>
  <section class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <p class="eyebrow">Estilo de tarjeta</p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="s in STYLES"
          :key="s.id"
          type="button"
          class="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          :class="store.dishCard.style === s.id ? 'border-ember bg-ember-50 text-ink' : 'border-line text-steel-500 hover:text-ink'"
          @click="store.updateDishCard({ style: s.id })"
        >
          <i class="pi text-[13px]" :class="s.icon" />
          <span class="font-mono text-[11px] uppercase tracking-[0.08em]">{{ s.label }}</span>
        </button>
      </div>
    </div>

    <hr class="border-hairline" />

    <div class="flex flex-col gap-2">
      <p class="eyebrow">Qué se ve en cada plato</p>
      <label
        v-for="f in FIELDS"
        :key="f.key"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1.5"
      >
        <span class="text-[13px] text-ink">{{ f.label }}</span>
        <button
          type="button"
          role="switch"
          :aria-checked="store.dishCard.show[f.key]"
          class="relative h-5 w-9 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          :class="store.dishCard.show[f.key] ? 'bg-ember' : 'bg-line'"
          @click="store.toggleDishCardField(f.key)"
        >
          <span
            class="absolute top-0.5 size-4 rounded-full bg-white transition-all"
            :class="store.dishCard.show[f.key] ? 'left-4' : 'left-0.5'"
          />
        </button>
      </label>
    </div>
  </section>
</template>
