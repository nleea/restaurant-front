<script setup lang="ts">
// A COP currency input. Keeps a numeric model, shows grouped digits, and the
// leading $ sits in a fixed gutter so the figure is mono and column-aligned.
import { computed } from 'vue'

const props = defineProps<{ modelValue: number | null; placeholder?: string; big?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const shown = computed(() =>
  props.modelValue == null ? '' : props.modelValue.toLocaleString('es-CO', { maximumFractionDigits: 0 }),
)

function onInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '')
  emit('update:modelValue', digits === '' ? null : Number(digits))
}
</script>

<template>
  <div
    class="flex items-center rounded-xl border border-line bg-surface focus-within:border-ember/60 focus-within:ring-2 focus-within:ring-ember/20"
    :class="big ? 'h-12' : 'h-11'"
  >
    <span class="grid h-full w-9 place-items-center border-r border-line font-mono text-steel-400">$</span>
    <input
      :value="shown"
      inputmode="numeric"
      :placeholder="placeholder ?? '0'"
      class="w-full bg-transparent px-3 font-mono tabular-nums text-ink outline-none placeholder:text-steel-400"
      :class="big ? 'text-xl font-bold' : 'text-base'"
      @input="onInput"
    />
  </div>
</template>
