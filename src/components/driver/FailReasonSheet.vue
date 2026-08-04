<script setup lang="ts">
// Reason picker for a stop that couldn't be delivered. The fixed list matches the backend's
// accepted reasons exactly; "Otro" reveals a free-text comment. A second bottom sheet, stacked
// above the detail — same El Pase sheet pattern, alert-tinted because this is the not-delivered
// path.
import { computed, ref } from 'vue'

// Fixed not-delivered reasons; must match the backend's list. "Otro" pairs with a free comment.
const FAIL_REASONS = [
  'Cliente no contesta',
  'Dirección incorrecta / no la encuentra',
  'Cliente rechazó el pedido',
  'Cliente canceló',
  'Otro',
] as const

const emit = defineEmits<{ close: []; confirm: [reason: string, comment: string] }>()

const reason = ref<string>('')
const comment = ref('')
const needsComment = computed(() => reason.value === 'Otro')
const canConfirm = computed(
  () => reason.value !== '' && (!needsComment.value || comment.value.trim() !== ''),
)

function confirm() {
  if (!canConfirm.value) return
  emit('confirm', reason.value, comment.value)
}
</script>

<template>
  <div class="fixed inset-0 z-[70] bg-graphite-900/40 backdrop-blur-sm" @click="emit('close')" />
  <aside
    class="sheet fixed inset-x-0 bottom-0 z-[80] mx-auto flex max-h-[88dvh] max-w-md flex-col rounded-t-2xl border border-line bg-paper"
    role="dialog"
    aria-modal="true"
    aria-label="Motivo de no entrega"
  >
    <header class="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <p class="eyebrow text-alert-600">No se pudo entregar</p>
        <p class="font-display text-lg font-bold text-ink">¿Qué pasó?</p>
      </div>
      <button
        type="button"
        class="grid size-9 place-items-center rounded-lg border border-line text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        aria-label="Cerrar"
        @click="emit('close')"
      >
        <i class="pi pi-times" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-4">
      <div class="flex flex-col gap-2">
        <button
          v-for="r in FAIL_REASONS"
          :key="r"
          type="button"
          class="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/30"
          :class="
            reason === r
              ? 'border-alert/50 bg-alert/5 text-alert-600'
              : 'border-line bg-surface text-ink hover:bg-sunken'
          "
          @click="reason = r"
        >
          {{ r }}
          <i v-if="reason === r" class="pi pi-check text-sm" />
        </button>
      </div>

      <div v-if="needsComment" class="mt-3">
        <label for="fail-comment" class="eyebrow">Detalle</label>
        <textarea
          id="fail-comment"
          v-model="comment"
          rows="2"
          placeholder="Cuéntale al despachador qué pasó…"
          class="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-steel-400 focus:border-alert/60 focus:ring-2 focus:ring-alert/20"
        />
      </div>
    </div>

    <div class="border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
      <button
        type="button"
        class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-alert text-base font-bold text-white transition hover:bg-alert-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alert/40 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!canConfirm"
        @click="confirm"
      >
        <i class="pi pi-flag text-sm" /> Confirmar no entrega
      </button>
    </div>
  </aside>
</template>

<style scoped>
@keyframes sheet-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.sheet {
  animation: sheet-in 0.24s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .sheet {
    animation: none;
  }
}
</style>
