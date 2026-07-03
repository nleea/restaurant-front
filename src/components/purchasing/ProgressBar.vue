<script setup lang="ts">
// The receipt-progress bar — the reusable El Pase depletion-bar analog. A thin track with a
// coloured fill (state class) and an optional midpoint notch, used by Órdenes rows, cards and the
// drawer so both boards read identically.
withDefaults(
  defineProps<{
    /** Fill percentage 0–100. */
    pct: number
    /** El Pase fill colour class, e.g. `bg-warn` / `bg-success` (from STATUS_META). */
    barClass: string
    /** Show the midpoint notch (as on the Inventario minimum marker). */
    notch?: boolean
    /** Track height utility (defaults to the h-1 list track). */
    heightClass?: string
    /** Track width utility (defaults to full width). */
    widthClass?: string
  }>(),
  { notch: false, heightClass: 'h-1', widthClass: 'w-full' },
)
</script>

<template>
  <span class="relative block rounded-full bg-sunken" :class="[heightClass, widthClass]">
    <span
      class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
      :class="barClass"
      :style="{ width: `${Math.max(0, Math.min(100, pct))}%` }"
    />
    <span v-if="notch" class="absolute inset-y-[-2px] left-1/2 w-px bg-steel-400" />
  </span>
</template>
