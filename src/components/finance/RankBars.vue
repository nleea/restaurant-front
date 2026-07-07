<script setup lang="ts">
// Ranked horizontal bars (top products). Bar width is proportional to value; the
// fill interpolates ember → success by rank. Amounts are mono tabular.
import { computed } from 'vue'
import { cop } from '@/lib/cop'

const props = defineProps<{ items: { name: string; value: number; sub: string }[] }>()

const max = computed(() => Math.max(1, ...props.items.map((i) => i.value)))
const rows = computed(() =>
  props.items.map((it, i) => {
    const t = props.items.length > 1 ? 1 - i / (props.items.length - 1) : 1 // 1 = ember (top), 0 = success
    return {
      ...it,
      widthPct: (it.value / max.value) * 100,
      color: `color-mix(in oklab, var(--color-ember) ${Math.round(t * 100)}%, var(--color-success))`,
    }
  }),
)
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div v-for="(r, i) in rows" :key="r.name" class="flex flex-col gap-1">
      <div class="flex items-baseline justify-between gap-2">
        <span class="truncate text-[13px] text-ink"><span class="mr-1.5 font-mono text-[11px] text-steel-400">{{ i + 1 }}</span>{{ r.name }}</span>
        <span class="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-ink">{{ cop(r.value) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
          <div class="h-full rounded-full" :style="{ width: r.widthPct + '%', backgroundColor: r.color }" />
        </div>
        <span class="w-16 shrink-0 text-right font-mono text-[10px] text-steel-500">{{ r.sub }}</span>
      </div>
    </div>
  </div>
</template>
