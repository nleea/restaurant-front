<script setup lang="ts">
// Flujo de caja — cumulative cash balance over the month with an area fill and a
// dashed minimum-operational threshold. If the balance dips below it, the fill
// and line turn alert red (the parent surfaces a badge).
import { computed } from 'vue'
import { copShort } from '@/lib/cop'

const props = defineProps<{ points: { label: string; value: number }[]; threshold: number }>()

const W = 340
const H = 170
const PAD = { l: 38, r: 8, t: 12, b: 22 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b

const max = computed(() => Math.max(props.threshold, ...props.points.map((p) => p.value)) * 1.1)
const min = computed(() => Math.min(0, ...props.points.map((p) => p.value)))
function x(i: number): number {
  return PAD.l + (plotW * i) / Math.max(1, props.points.length - 1)
}
function y(v: number): number {
  return PAD.t + plotH - ((v - min.value) / (max.value - min.value)) * plotH
}
const breached = computed(() => props.points.some((p) => p.value < props.threshold))
const stroke = computed(() => (breached.value ? 'var(--color-alert)' : 'var(--color-success)'))

const linePath = computed(() => props.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' '))
const areaPath = computed(() => {
  if (!props.points.length) return ''
  const base = PAD.t + plotH
  return `M${x(0)},${base} ` + props.points.map((p, i) => `L${x(i)},${y(p.value)}`).join(' ') + ` L${x(props.points.length - 1)},${base} Z`
})
const thresholdY = computed(() => y(props.threshold))
const xLabels = computed(() => {
  const n = props.points.length
  return [0, Math.floor(n / 2), n - 1].map((i) => ({ x: x(i), label: props.points[i]?.label ?? '' }))
})
</script>

<template>
  <div style="aspect-ratio: 340 / 170">
    <svg :viewBox="`0 0 ${W} ${H}`" class="block w-full" role="img" aria-label="Flujo de caja del mes">
      <!-- y gridlines -->
      <g v-for="f in [0, 0.5, 1]" :key="f">
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="PAD.t + plotH - f * plotH" :y2="PAD.t + plotH - f * plotH" stroke="var(--color-hairline)" stroke-width="1" />
        <text :x="PAD.l - 5" :y="PAD.t + plotH - f * plotH + 3" text-anchor="end" class="fill-steel-400 font-mono" style="font-size: 7px">{{ copShort(min + (max - min) * f) }}</text>
      </g>
      <!-- area + line -->
      <path :d="areaPath" :fill="stroke" opacity="0.08" />
      <path :d="linePath" fill="none" :stroke="stroke" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />
      <!-- threshold -->
      <line :x1="PAD.l" :x2="W - PAD.r" :y1="thresholdY" :y2="thresholdY" stroke="var(--color-alert)" stroke-width="1" stroke-dasharray="3 3" opacity="0.7" />
      <text :x="W - PAD.r" :y="thresholdY - 3" text-anchor="end" class="fill-alert-600 font-mono" style="font-size: 7px">mínimo {{ copShort(threshold) }}</text>
      <!-- x labels -->
      <text v-for="l in xLabels" :key="l.label" :x="l.x" :y="H - 7" text-anchor="middle" class="fill-steel-500 font-mono" style="font-size: 7px">{{ l.label }}</text>
    </svg>
  </div>
</template>
