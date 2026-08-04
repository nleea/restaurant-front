<script setup lang="ts">
// A mono tabular figure that count-ups (300ms) when its value changes — the
// "the number moved" feedback when a movement lands. Honors reduced-motion by
// snapping. Kept generic (peso or plain) via the `format` prop.
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; format?: (n: number) => string; duration?: number }>(),
  { duration: 320 },
)

const fmt = (n: number) => (props.format ? props.format(n) : Math.round(n).toString())
const display = ref(fmt(props.value))
const reduce =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

let raf = 0
watch(
  () => props.value,
  (to, from) => {
    if (reduce || to === from) {
      display.value = fmt(to)
      return
    }
    const start = performance.now()
    const cancel = () => cancelAnimationFrame(raf)
    cancel()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / props.duration)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      display.value = fmt(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  },
)

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span class="tabular-nums">{{ display }}</span>
</template>
