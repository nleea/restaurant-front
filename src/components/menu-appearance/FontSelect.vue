<script setup lang="ts">
// Font picker for the customer menu. Curated list only (modern sans + warmer serif options); the
// chosen family loads from Google Fonts and previews live in its own typeface. Applies only to the
// storefront preview — never to the El Pase admin chrome.
import { onMounted, watch } from 'vue'
import { CURATED_FONTS, ensureFontLoaded, fontStack } from '@/lib/menuAppearance'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

// Warm up every option so the dropdown previews render immediately, and the current one on mount.
onMounted(() => CURATED_FONTS.forEach((f) => ensureFontLoaded(f.name)))
watch(() => props.modelValue, (name) => ensureFontLoaded(name), { immediate: true })

function onSelect(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-3">
      <span class="text-[13px] text-ink">Tipografía</span>
      <div class="relative">
        <select
          :value="modelValue"
          class="appearance-none rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-8 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          aria-label="Tipografía de la carta"
          @change="onSelect"
        >
          <option v-for="f in CURATED_FONTS" :key="f.name" :value="f.name">
            {{ f.name }} · {{ f.tone }}
          </option>
        </select>
        <i class="pi pi-chevron-down pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-steel-500" />
      </div>
    </div>
    <!-- Live specimen in the selected face. -->
    <p
      class="rounded-lg border border-line bg-sunken px-3 py-2.5 text-[19px] leading-tight text-ink"
      :style="{ fontFamily: fontStack(modelValue) }"
    >
      Ceviche mixto &amp; limonada de coco
    </p>
  </div>
</template>
