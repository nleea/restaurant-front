<script setup lang="ts">
// Ingresos vs Gastos — grouped bars per day with a net-profit line overlay.
// Custom SVG, responsive via viewBox + aspect-ratio; hover shows a tooltip card.
import { computed, ref } from 'vue'
import { cop, copShort } from '@/lib/cop'

const props = defineProps<{ data: { day: string; income: number; expenses: number }[] }>()

const W = 340
const H = 190
const PAD = { l: 36, r: 8, t: 10, b: 24 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b

const max = computed(() => {
  const m = Math.max(1, ...props.data.flatMap((d) => [d.income, d.expenses]))
  // round up to a "nice" step so gridlines read cleanly
  const step = Math.pow(10, Math.floor(Math.log10(m)))
  return Math.ceil(m / step) * step
})
function y(v: number): number {
  return PAD.t + plotH - (v / max.value) * plotH
}
const groupW = computed(() => plotW / props.data.length)
const barW = computed(() => groupW.value * 0.3)

const bars = computed(() =>
  props.data.map((d, i) => {
    const cx = PAD.l + groupW.value * i + groupW.value / 2
    return {
      ...d,
      cx,
      incomeX: cx - barW.value - 1,
      expenseX: cx + 1,
      incomeY: y(d.income),
      incomeH: PAD.t + plotH - y(d.income),
      expenseY: y(d.expenses),
      expenseH: PAD.t + plotH - y(d.expenses),
      profitY: y(d.income - d.expenses),
    }
  }),
)
const profitPath = computed(() => bars.value.map((b, i) => `${i === 0 ? 'M' : 'L'}${b.cx},${b.profitY}`).join(' '))
const gridlines = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => ({ f, gy: PAD.t + plotH - f * plotH, label: copShort(max.value * f) })))

const hover = ref<number | null>(null)
const tip = computed(() => (hover.value === null ? null : bars.value[hover.value]))
</script>

<template>
  <div class="relative" style="aspect-ratio: 340 / 190">
    <svg :viewBox="`0 0 ${W} ${H}`" class="block w-full" role="img" aria-label="Ingresos vs gastos por día">
      <!-- gridlines -->
      <g v-for="g in gridlines" :key="g.f">
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="g.gy" :y2="g.gy" stroke="var(--color-hairline)" stroke-width="1" />
        <text :x="PAD.l - 5" :y="g.gy + 3" text-anchor="end" class="fill-steel-400 font-mono" style="font-size: 7px">{{ g.label }}</text>
      </g>
      <!-- bars -->
      <g v-for="(b, i) in bars" :key="b.day">
        <rect :x="b.incomeX" :y="b.incomeY" :width="barW" :height="Math.max(0, b.incomeH)" rx="1.5" style="fill: var(--color-success)" :opacity="hover === null || hover === i ? 1 : 0.5" />
        <rect :x="b.expenseX" :y="b.expenseY" :width="barW" :height="Math.max(0, b.expenseH)" rx="1.5" style="fill: var(--color-alert)" :opacity="hover === null || hover === i ? 1 : 0.5" />
        <text :x="b.cx" :y="H - 8" text-anchor="middle" class="fill-steel-500 font-mono" style="font-size: 8px">{{ b.day }}</text>
        <!-- hit area -->
        <rect :x="PAD.l + groupW * i" :y="PAD.t" :width="groupW" :height="plotH" fill="transparent" @mouseenter="hover = i" @mouseleave="hover = null" />
      </g>
      <!-- profit line -->
      <path :d="profitPath" fill="none" style="stroke: var(--color-info)" stroke-width="1.5" stroke-linejoin="round" />
      <circle v-for="b in bars" :key="'p' + b.day" :cx="b.cx" :cy="b.profitY" r="2" style="fill: var(--color-info)" />
    </svg>

    <!-- tooltip -->
    <div
      v-if="tip"
      class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-paper px-2.5 py-1.5 shadow-lg"
      :style="{ left: (tip.cx / W) * 100 + '%', top: (tip.incomeY / H) * 100 - 2 + '%' }"
    >
      <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-ink">{{ tip.day }}</p>
      <p class="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-success-600"><span class="size-1.5 rounded-full bg-success" />{{ cop(tip.income) }}</p>
      <p class="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-alert-600"><span class="size-1.5 rounded-full bg-alert" />{{ cop(tip.expenses) }}</p>
      <p class="mt-0.5 flex items-center gap-1.5 border-t border-hairline pt-0.5 font-mono text-[11px] font-semibold tabular-nums text-info-600"><span class="size-1.5 rounded-full bg-info" />{{ cop(tip.income - tip.expenses) }}</p>
    </div>
  </div>
</template>
