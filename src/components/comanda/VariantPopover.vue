<script setup lang="ts">
// A small popover that blooms on a multi-variant tile: pick a size, and the tile
// stamps that variant onto the dupe. Lives on the tile itself, never a dropdown
// somewhere else. Closes on Escape or an outside click.
import { onBeforeUnmount, onMounted } from 'vue'
import { formatCOP } from '@/lib/money'

defineProps<{ variants: { id: string; label: string; price: number }[] }>()
const emit = defineEmits<{ select: [variantId: string]; close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <!-- Backdrop catches the outside tap; the panel stops propagation. -->
  <div class="absolute inset-0 z-20" @click="emit('close')">
    <div
      class="absolute inset-x-2 bottom-2 z-30 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
      role="menu"
      @click.stop
    >
      <p class="px-2 pb-1 pt-1 eyebrow">Elige tamaño</p>
      <button
        v-for="v in variants"
        :key="v.id"
        type="button"
        role="menuitem"
        class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-none"
        @click="emit('select', v.id)"
      >
        <span class="text-sm font-medium text-ink">{{ v.label }}</span>
        <span class="font-mono text-sm font-semibold tabular-nums text-steel-600">{{ formatCOP(v.price) }}</span>
      </button>
    </div>
  </div>
</template>
