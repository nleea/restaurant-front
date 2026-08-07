<script setup lang="ts">
// The docket modal shell: a blurred graphite backdrop with a paper docket that
// slides up. Closes on backdrop click and Escape. Width is caller-controlled.
import { onMounted, onBeforeUnmount } from 'vue'

withDefaults(defineProps<{ title: string; eyebrow?: string; wide?: boolean }>(), { wide: false })
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 grid place-items-end justify-center overflow-y-auto p-0 sm:place-items-center sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="fixed inset-0 bg-graphite-900/45 backdrop-blur-sm"
        @click="emit('close')"
      />
      <div
        class="station-modal relative z-10 w-full rounded-t-2xl bg-paper shadow-2xl sm:rounded-2xl"
        :class="wide ? 'sm:max-w-3xl' : 'sm:max-w-md'"
      >
        <div class="docket-perf h-[7px] w-full rounded-t-2xl" />
        <header class="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6">
          <div class="min-w-0">
            <p v-if="eyebrow" class="eyebrow truncate">{{ eyebrow }}</p>
            <h2 class="mt-1 truncate font-display text-lg font-semibold text-ink">{{ title }}</h2>
          </div>
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-lg text-steel-500 transition hover:bg-sunken hover:text-ink"
            aria-label="Cerrar"
            @click="emit('close')"
          >
            <i class="pi pi-times text-sm" />
          </button>
        </header>
        <div class="px-5 pb-5 sm:px-6 sm:pb-6"><slot /></div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes modal-up {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.station-modal {
  animation: modal-up 0.2s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .station-modal {
    animation: none;
  }
}
</style>
