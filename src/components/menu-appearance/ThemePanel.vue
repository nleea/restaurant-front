<script setup lang="ts">
// "Tema visual": the five brand colors + typography. Writes straight through to the store draft, so
// the preview updates live. The swatches are the customer's palette — the one place color enters
// this otherwise-monochrome editor.
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import ColorField from './ColorField.vue'
import FontSelect from './FontSelect.vue'

const store = useMenuAppearanceStore()

const COLORS: { key: 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'textColor' | 'accentColor'; label: string }[] = [
  { key: 'primaryColor', label: 'Primario' },
  { key: 'secondaryColor', label: 'Secundario' },
  { key: 'backgroundColor', label: 'Fondo' },
  { key: 'textColor', label: 'Texto' },
  { key: 'accentColor', label: 'Acento' },
]
</script>

<template>
  <section class="flex flex-col gap-5">
    <div class="flex items-center justify-between">
      <p class="eyebrow">Colores</p>
      <button
        type="button"
        class="rounded-lg px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-steel-500 transition hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @click="store.resetTheme()"
      >
        <i class="pi pi-refresh text-[9px]" /> Restablecer
      </button>
    </div>

    <div class="flex flex-col gap-3">
      <ColorField
        v-for="c in COLORS"
        :key="c.key"
        :label="c.label"
        :model-value="store.theme[c.key]"
        @update:model-value="store.updateTheme({ [c.key]: $event })"
      />
    </div>

    <hr class="border-hairline" />

    <FontSelect
      :model-value="store.theme.fontFamily"
      @update:model-value="store.updateTheme({ fontFamily: $event })"
    />
  </section>
</template>
