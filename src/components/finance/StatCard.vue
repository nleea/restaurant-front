<script setup lang="ts">
// A KPI card for the Finanzas dashboard. The figure is mono tabular and coloured
// by kind (income = success, expense = alert, profit = info, neutral = ink).
import { computed } from 'vue'

const props = defineProps<{
  label: string
  value: string
  icon: string
  tone?: 'income' | 'expense' | 'profit' | 'neutral'
  trend?: { dir: 'up' | 'down'; text: string }
  sub?: string
}>()

const valueColor = computed(
  () =>
    ({
      income: 'text-success-600',
      expense: 'text-alert-600',
      profit: 'text-info-600',
      neutral: 'text-ink',
    })[props.tone ?? 'neutral'],
)
</script>

<template>
  <div class="card flex min-w-0 flex-col gap-2 p-5">
    <div class="flex items-start justify-between gap-2">
      <span class="eyebrow truncate">{{ label }}</span>
      <i :class="['pi', icon, 'shrink-0 text-base text-steel-400']" />
    </div>
    <span class="truncate font-mono text-lg font-bold tabular-nums leading-none sm:text-2xl lg:text-3xl" :class="valueColor">{{ value }}</span>
    <div class="flex items-center gap-2">
      <span
        v-if="trend"
        class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
        :class="trend.dir === 'up' ? 'bg-success/12 text-success-600' : 'bg-alert/12 text-alert-600'"
      >
        <i :class="['pi', trend.dir === 'up' ? 'pi-arrow-up' : 'pi-arrow-down', 'text-[9px]']" />{{ trend.text }}
      </span>
      <span v-if="sub" class="font-mono text-[11px] text-steel-500">{{ sub }}</span>
    </div>
  </div>
</template>
