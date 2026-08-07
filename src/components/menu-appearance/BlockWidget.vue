<script setup lang="ts">
// One block as it appears on the canvas: a mono El Pase card (color is reserved for drag state, per
// the system's "color = state" rule). Shows the block's name, a representative icon, its cell size
// as a mono badge (e.g. 2×2), and three controls: a drag handle, a size cycler, and hide. The card
// is purely presentational — the canvas owns all geometry and validation.
import { computed } from 'vue'
import { BLOCK_META, SIZE_CELLS, type Block } from '@/lib/menuAppearance'

const props = defineProps<{
  block: Block
  dragging: boolean
}>()
const emit = defineEmits<{
  (e: 'grab', event: PointerEvent): void
  (e: 'resize'): void
  (e: 'hide'): void
}>()

const meta = computed(() => BLOCK_META[props.block.id])
const sizeBadge = computed(() => {
  const { w, h } = SIZE_CELLS[props.block.size]
  return `${w}×${h}`
})
</script>

<template>
  <div
    class="group/w flex h-full w-full flex-col overflow-hidden rounded-xl border bg-paper transition-shadow"
    :class="
      dragging
        ? 'border-ember shadow-[0_18px_40px_-18px_rgba(242,147,59,0.7)]'
        : 'border-line shadow-[0_1px_2px_-1px_rgb(20_24_28/0.06)]'
    "
  >
    <!-- Header: drag handle + name + controls -->
    <div class="flex items-center gap-1.5 border-b border-hairline bg-sunken/60 px-2 py-1.5">
      <button
        type="button"
        class="grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded text-steel-500 transition hover:bg-steel-300/40 hover:text-ink active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        aria-label="Arrastrar bloque"
        @pointerdown="emit('grab', $event)"
      >
        <i class="pi pi-bars text-[11px]" />
      </button>
      <i class="pi shrink-0 text-[12px] text-steel-600" :class="meta.icon" />
      <span class="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">
        {{ meta.label }}
      </span>
      <span class="shrink-0 font-mono text-[10px] tabular-nums text-steel-500">{{ sizeBadge }}</span>
      <button
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded text-steel-500 transition hover:bg-steel-300/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        aria-label="Cambiar tamaño"
        title="Cambiar tamaño (pequeño → mediano → grande)"
        @click="emit('resize')"
      >
        <i class="pi pi-arrows-alt text-[11px]" />
      </button>
      <button
        type="button"
        class="grid size-6 shrink-0 place-items-center rounded text-steel-500 transition hover:bg-alert/10 hover:text-alert focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        aria-label="Ocultar bloque"
        title="Ocultar (vuelve a la bandeja)"
        @click="emit('hide')"
      >
        <i class="pi pi-eye-slash text-[11px]" />
      </button>
    </div>

    <!-- Body: a quiet representative preview of the block's content -->
    <div class="flex min-h-0 flex-1 items-center justify-center px-2.5 py-2">
      <p class="text-center text-[11px] leading-snug text-muted">{{ meta.blurb }}</p>
    </div>
  </div>
</template>
