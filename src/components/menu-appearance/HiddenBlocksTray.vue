<script setup lang="ts">
// Blocks that are currently hidden live here, off the canvas. Press and drag one onto the grid to
// place it exactly (same gesture as moving a placed block); a plain tap drops it into the first free
// cell. Hiding a block from the canvas sends it back to this tray.
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import { BLOCK_META, type BlockId } from '@/lib/menuAppearance'

const store = useMenuAppearanceStore()
const emit = defineEmits<{ (e: 'grab', id: BlockId, event: PointerEvent): void }>()
</script>

<template>
  <section class="flex flex-col gap-2">
    <p class="eyebrow">Bloques ocultos</p>
    <div v-if="store.hiddenBlocks.length" class="flex flex-wrap gap-2">
      <button
        v-for="block in store.hiddenBlocks"
        :key="block.id"
        type="button"
        class="flex cursor-grab touch-none items-center gap-2 rounded-lg border border-dashed border-line bg-paper px-2.5 py-1.5 text-left transition hover:border-ember hover:bg-ember-50 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @pointerdown="emit('grab', block.id, $event)"
      >
        <i class="pi text-[12px] text-steel-500" :class="BLOCK_META[block.id].icon" />
        <span class="font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
          {{ BLOCK_META[block.id].label }}
        </span>
        <i class="pi pi-plus text-[9px] text-steel-400" />
      </button>
    </div>
    <p v-else class="text-[11px] text-muted">
      Todos los bloques están visibles. Oculta uno desde el lienzo para guardarlo aquí.
    </p>
  </section>
</template>
