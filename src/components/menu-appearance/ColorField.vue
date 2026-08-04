<script setup lang="ts">
// A color control in the RadiusPanel idiom: native inputs + Tailwind tokens, no PrimeVue. A swatch
// (native <input type=color>) sits beside a hand-editable mono hex field so power users can paste a
// brand hex exactly. Emits a normalized #rrggbb string via v-model.
import { computed } from 'vue'

const props = defineProps<{
  label: string
  modelValue: string
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

// The <input type=color> only accepts #rrggbb; guard against short/invalid drafts from the text box.
const HEX = /^#([0-9a-f]{6})$/i
const safeColor = computed(() => (HEX.test(props.modelValue) ? props.modelValue : '#000000'))

function onSwatch(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
function onHex(event: Event) {
  let value = (event.target as HTMLInputElement).value.trim()
  if (value && !value.startsWith('#')) value = `#${value}`
  // Commit only complete hex values; ignore intermediate typing.
  if (HEX.test(value)) emit('update:modelValue', value.toLowerCase())
}
</script>

<template>
  <label class="flex items-center justify-between gap-3">
    <span class="text-[13px] text-ink">{{ label }}</span>
    <span class="flex items-center gap-2">
      <span
        class="relative size-8 shrink-0 overflow-hidden rounded-lg border border-line shadow-inner"
        :style="{ backgroundColor: safeColor }"
      >
        <input
          type="color"
          :value="safeColor"
          class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          :aria-label="`${label}: selector de color`"
          @input="onSwatch"
        />
      </span>
      <input
        type="text"
        :value="modelValue"
        spellcheck="false"
        maxlength="7"
        class="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-right font-mono text-[12px] uppercase tabular-nums text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :aria-label="`${label}: código hexadecimal`"
        @change="onHex"
      />
    </span>
  </label>
</template>
