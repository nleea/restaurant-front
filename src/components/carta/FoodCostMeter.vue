<script setup lang="ts">
// SIGNATURE — the dish's economics as a heat meter. Food cost is the only figure
// on this screen that carries color: a healthy dish sits calm (success), a tight
// one warms (ember), a bleeding one runs hot (alert) and breathes under the lamp,
// reusing El Pase's `.heat-hot` language from the arqueo/overdue dockets.
//
// When the recipe cost is `partial` (an ingredient has no purchase history yet) or the
// product has no price, we CANNOT honestly compute a margin — a zeroed cost would read
// as a fabricated 100% margin. In that case the meter shows a muted "sin costo" state.
import { computed } from 'vue'
import { healthOf, HEALTH_COPY, money } from '@/lib/menuCosting'

const props = defineProps<{ cost: number; price: number; margin: number; partial: boolean }>()

// Honest state: no reliable cost (partial) or no price set — never fabricate a margin.
const unpriced = computed(() => props.price <= 0)
const honest = computed(() => props.partial || unpriced.value)

const pct = computed(() => (props.price > 0 ? (props.cost / props.price) * 100 : 0))
const marginPct = computed(() => (props.price > 0 ? (props.margin / props.price) * 100 : 0))
const health = computed(() => healthOf(pct.value))

const fill = computed(
  () =>
    ({
      good: 'var(--color-success)',
      watch: 'var(--color-ember)',
      bad: 'var(--color-alert)',
    })[health.value],
)
const tone = computed(
  () =>
    ({ good: 'text-success-600', watch: 'text-ember-600', bad: 'text-alert-600' })[health.value],
)
// Only a genuinely bleeding dish (>50% food cost) breathes; a merely tight one glows warm.
const heatClass = computed(() =>
  honest.value ? '' : pct.value > 50 ? 'heat-hot' : health.value === 'bad' ? 'heat-warm' : '',
)
</script>

<template>
  <!-- Honest partial / unpriced state: no fabricated margin -->
  <div v-if="honest" class="rounded-xl border border-dashed border-line bg-sunken/40 p-3.5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="eyebrow">Margen del plato</p>
        <p class="mt-1 font-display text-lg font-bold leading-none text-steel-500">
          {{ unpriced ? 'Sin precio' : 'Costo parcial' }}
        </p>
      </div>
      <div class="text-right font-mono text-[11px] text-steel-500">
        <p v-if="!partial">costo <span class="tabular-nums text-ink">{{ money(cost) }}</span></p>
        <p v-else>costo <span class="tabular-nums text-steel-400">parcial</span></p>
        <p>precio <span class="tabular-nums text-ink">{{ unpriced ? '—' : money(price) }}</span></p>
      </div>
    </div>
    <p class="mt-2 font-mono text-[11px] leading-relaxed text-steel-500">
      <i class="pi pi-info-circle text-[10px] text-steel-400" />
      {{ unpriced
        ? 'Fija un precio de venta para ver el margen.'
        : 'Falta el costo de algún insumo (sin compras registradas). Registra compras para ver el margen real.' }}
    </p>
  </div>

  <!-- Full meter: food-cost share of the price carries the heat -->
  <div v-else class="rounded-xl border border-line bg-surface p-3.5" :class="heatClass">
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="eyebrow">Margen del plato</p>
        <p class="mt-1 font-display text-2xl font-bold leading-none tabular-nums" :class="tone">
          {{ money(margin) }}
          <span class="font-mono text-sm font-semibold">· {{ marginPct.toFixed(1) }}%</span>
        </p>
      </div>
      <div class="text-right font-mono text-[11px] text-steel-500">
        <p>costo <span class="tabular-nums text-ink">{{ money(cost) }}</span></p>
        <p>precio <span class="tabular-nums text-ink">{{ money(price) }}</span></p>
      </div>
    </div>

    <!-- The meter: food-cost share of the price -->
    <div class="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
      <div
        class="h-full rounded-full transition-all duration-300"
        :style="{ width: Math.min(100, pct) + '%', backgroundColor: fill }"
      />
    </div>
    <div class="mt-1.5 flex items-center justify-between font-mono text-[11px]">
      <span :class="tone">
        <i
          :class="['pi', health === 'good' ? 'pi-check-circle' : 'pi-exclamation-triangle', 'text-[10px]']"
        />
        {{ pct.toFixed(1) }}% food cost — {{ HEALTH_COPY[health] }}
      </span>
      <span class="text-steel-400">meta &lt; 35%</span>
    </div>
  </div>
</template>
