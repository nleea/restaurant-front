<script setup lang="ts">
// Persistent order bar, styled as the top edge of a thermal receipt peeking up from the bottom —
// a preview of the comanda that expands into the full ticket. Appears once there's something in the
// cart. Big, thumb-reachable.
import { formatCOP } from '@/lib/money'

defineProps<{ itemCount: number; total: number }>()
const emit = defineEmits<{ (e: 'open'): void }>()
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    <button
      type="button"
      class="sf-cartbar pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-[var(--sf-primary)] px-5 py-3.5 text-white shadow-[0_-6px_24px_-8px_rgb(0_0_0/0.45)] transition active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      @click="emit('open')"
    >
      <span class="grid size-7 place-items-center rounded-full bg-white/20 font-mono text-[13px] font-bold tabular-nums">{{ itemCount }}</span>
      <span class="font-semibold">Ver comanda</span>
      <span class="ml-auto font-mono text-[15px] font-bold tabular-nums">{{ formatCOP(total) }}</span>
      <i class="pi pi-chevron-right text-xs opacity-80" />
    </button>
  </div>
</template>

<style scoped>
/* Scalloped top edge — the receipt peeking up. */
.sf-cartbar {
  -webkit-mask:
    radial-gradient(circle at 8px 0, transparent 5px, #000 5.5px) top/16px 8px repeat-x,
    linear-gradient(#000 0 0) bottom/100% calc(100% - 7px) no-repeat;
  mask:
    radial-gradient(circle at 8px 0, transparent 5px, #000 5.5px) top/16px 8px repeat-x,
    linear-gradient(#000 0 0) bottom/100% calc(100% - 7px) no-repeat;
}
</style>
