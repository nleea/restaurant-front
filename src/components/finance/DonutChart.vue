<script setup lang="ts">
// Donut chart via the stroke-dasharray technique. Center shows the total; the
// parent renders the legend (with amounts and %). Hover dims the other arcs.
import { computed, ref } from 'vue'

const props = defineProps<{
  segments: { name: string; pct: number; color: string }[]
  centerTop: string
  centerBottom: string
}>()

const R = 44
const C = 2 * Math.PI * R

const arcs = computed(() => {
  let acc = 0
  return props.segments.map((s) => {
    const dash = (s.pct / 100) * C
    const arc = { ...s, dash, gap: C - dash, offset: -acc }
    acc += dash
    return arc
  })
})

const hover = ref<number | null>(null)
defineExpose({ hover })
const emit = defineEmits<{ hover: [number | null] }>()
function setHover(i: number | null) {
  hover.value = i
  emit('hover', i)
}
</script>

<template>
  <div class="relative mx-auto" style="width: 168px; aspect-ratio: 1">
    <svg viewBox="0 0 120 120" class="block w-full -rotate-90">
      <circle cx="60" cy="60" :r="R" fill="none" stroke="var(--color-sunken)" stroke-width="15" />
      <circle
        v-for="(a, i) in arcs" :key="a.name"
        cx="60" cy="60" :r="R" fill="none"
        :stroke="a.color" stroke-width="15"
        :stroke-dasharray="`${a.dash} ${a.gap}`"
        :stroke-dashoffset="a.offset"
        :opacity="hover === null || hover === i ? 1 : 0.35"
        class="transition-opacity"
        @mouseenter="setHover(i)" @mouseleave="setHover(null)"
      >
        <title>{{ a.name }} · {{ a.pct }}%</title>
      </circle>
    </svg>
    <div class="pointer-events-none absolute inset-0 grid place-items-center text-center">
      <div>
        <p class="font-mono text-[10px] uppercase tracking-wide text-steel-500">{{ centerTop }}</p>
        <p class="font-mono text-lg font-bold tabular-nums text-ink">{{ centerBottom }}</p>
      </div>
    </div>
  </div>
</template>
