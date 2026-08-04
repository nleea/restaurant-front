<script setup lang="ts">
// The "lienzo de bloques": a fixed-cell widget grid, hand-rolled with Pointer Events (no DnD lib).
// Blocks snap to whole cells, never overlap, and stay within the column count. The signature is
// here: at rest the grid guides are nearly invisible — the moment you grab a block, the board
// "ignites" under the heat lamp (ember guides bloom; the target cell glows ember when the drop is
// valid, alert-red when it isn't; a rejected drop snaps back).
//
// Drag math assumes a zero-gap grid (cellW = width/COLUMNS, cellH = ROW_H), so cells map to pixels
// exactly; visual spacing comes from each widget's inner inset, not grid gap.
import { computed, ref } from 'vue'
import {
  BLOCK_META,
  GRID_COLUMNS,
  SIZE_CELLS,
  SIZE_CYCLE,
  fitsInGrid,
  overlaps,
  type Block,
  type BlockSize,
  type GridPosition,
} from '@/lib/menuAppearance'
import { useMenuAppearanceStore } from '@/stores/menuAppearance'
import BlockWidget from './BlockWidget.vue'

const store = useMenuAppearanceStore()

const ROW_H = 76 // px per grid row; columns are fluid (1fr each)

const gridEl = ref<HTMLElement | null>(null)

interface DragState {
  id: Block['id']
  size: BlockSize
  // 'canvas' = moving a placed block; 'tray' = dropping a hidden block onto the grid.
  origin: 'canvas' | 'tray'
  // Pointer grab offset within the block, in pixels, so the block doesn't jump under the cursor.
  grabDx: number
  grabDy: number
  // Pointer start, to tell a tap (add to first free cell) from a real drag.
  startX: number
  startY: number
  moved: boolean
  target: GridPosition
  // Valid = fits the grid, no overlap, AND the pointer is over the canvas.
  valid: boolean
}
const drag = ref<DragState | null>(null)
const justDropped = ref<Block['id'] | null>(null)

const MOVE_THRESHOLD = 4 // px before a press counts as a drag rather than a tap

// Rows to render: enough to hold every block plus a spare band to drop into.
const rowCount = computed(() => {
  let maxBottom = 3
  for (const b of store.visibleBlocks) {
    maxBottom = Math.max(maxBottom, b.position.y + SIZE_CELLS[b.size].h)
  }
  return maxBottom + 2
})

const guideCells = computed(() => {
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < rowCount.value; y++) {
    for (let x = 0; x < GRID_COLUMNS; x++) cells.push({ x, y })
  }
  return cells
})

function cellStyle(position: GridPosition, size: BlockSize) {
  const { w, h } = SIZE_CELLS[size]
  return {
    gridColumn: `${position.x + 1} / span ${w}`,
    gridRow: `${position.y + 1} / span ${h}`,
  }
}

// Is this guide cell inside the current drag target's footprint?
function inTarget(cell: { x: number; y: number }): boolean {
  if (!drag.value) return false
  const { w, h } = SIZE_CELLS[drag.value.size]
  const { x, y } = drag.value.target
  return cell.x >= x && cell.x < x + w && cell.y >= y && cell.y < y + h
}

function pointToCell(clientX: number, clientY: number, size: BlockSize, grabDx: number, grabDy: number): GridPosition {
  const rect = gridEl.value!.getBoundingClientRect()
  const cellW = rect.width / GRID_COLUMNS
  const localX = clientX - rect.left - grabDx
  const localY = clientY - rect.top - grabDy
  const { w } = SIZE_CELLS[size]
  const x = Math.min(GRID_COLUMNS - w, Math.max(0, Math.round(localX / cellW)))
  const y = Math.max(0, Math.round(localY / ROW_H))
  return { x, y }
}

function isOverGrid(clientX: number, clientY: number): boolean {
  if (!gridEl.value) return false
  const rect = gridEl.value.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

// Moving a block already on the canvas.
function beginDrag(block: Block, event: PointerEvent) {
  if (event.button !== 0 || !gridEl.value) return
  event.preventDefault()
  const rect = gridEl.value.getBoundingClientRect()
  const cellW = rect.width / GRID_COLUMNS
  startDrag({
    id: block.id,
    size: block.size,
    origin: 'canvas',
    grabDx: event.clientX - rect.left - block.position.x * cellW,
    grabDy: event.clientY - rect.top - block.position.y * ROW_H,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    target: { ...block.position },
    valid: true,
  })
}

// Dropping a hidden block from the tray onto the canvas. Exposed so the tray (a sibling) can start
// a canvas drag from its own pointerdown — one unified gesture, same "ignite" feedback. The block is
// grabbed by its center; a tap (no real movement) falls back to adding it to the first free cell.
function startNewBlockDrag(id: Block['id'], event: PointerEvent) {
  if (event.button !== 0 || !gridEl.value) return
  event.preventDefault()
  const block = store.draft.blocks.find((b) => b.id === id)
  if (!block) return
  const rect = gridEl.value.getBoundingClientRect()
  const cellW = rect.width / GRID_COLUMNS
  const { w, h } = SIZE_CELLS[block.size]
  startDrag({
    id,
    size: block.size,
    origin: 'tray',
    grabDx: (w * cellW) / 2,
    grabDy: (h * ROW_H) / 2,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    target: pointToCell(event.clientX, event.clientY, block.size, (w * cellW) / 2, (h * ROW_H) / 2),
    valid: false,
  })
}
defineExpose({ startNewBlockDrag })

function startDrag(state: DragState) {
  drag.value = state
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp, { once: true })
}

function onPointerMove(event: PointerEvent) {
  const state = drag.value
  if (!state) return
  const moved =
    state.moved ||
    Math.abs(event.clientX - state.startX) > MOVE_THRESHOLD ||
    Math.abs(event.clientY - state.startY) > MOVE_THRESHOLD
  const target = pointToCell(event.clientX, event.clientY, state.size, state.grabDx, state.grabDy)
  const valid =
    isOverGrid(event.clientX, event.clientY) &&
    fitsInGrid(target, state.size) &&
    !overlaps({ id: state.id, position: target, size: state.size }, store.draft.blocks)
  drag.value = { ...state, moved, target, valid }
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  const state = drag.value
  drag.value = null
  if (!state) return

  if (state.origin === 'tray') {
    // Tap → add to the first free cell; a real drag → place where dropped if valid, else cancel.
    if (!state.moved) store.showBlock(state.id)
    else if (state.valid) store.showBlock(state.id, state.target)
    else return
    pulse(state.id)
    return
  }

  // Canvas move: commit only a valid placement; an invalid drop snaps back (block stays put).
  if (state.valid) {
    store.setBlockLayout(state.id, { position: state.target })
    pulse(state.id)
  }
}

// Brief ember pulse on the settled block (honors reduced-motion via CSS).
function pulse(id: Block['id']) {
  justDropped.value = id
  window.setTimeout(() => {
    if (justDropped.value === id) justDropped.value = null
  }, 450)
}

// Grow/shrink through small → medium → large, keeping the block's top-left where possible. Clamp x
// so a wider size stays in-grid; skip the change if it would overlap a neighbor.
function cycleSize(block: Block) {
  const idx = SIZE_CYCLE.indexOf(block.size)
  const next = SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length] ?? 'small'
  const { w } = SIZE_CELLS[next]
  const position = { x: Math.min(block.position.x, GRID_COLUMNS - w), y: block.position.y }
  if (overlaps({ id: block.id, position, size: next }, store.draft.blocks)) return
  store.setBlockLayout(block.id, { position, size: next })
}

// Keyboard placement: arrows nudge a focused block one cell; "r" cycles size. A move that would
// leave the grid or overlap is ignored (keeps the no-overlap invariant).
function onKey(block: Block, event: KeyboardEvent) {
  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault()
    cycleSize(block)
    return
  }
  const delta: Record<string, GridPosition> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  }
  const d = delta[event.key]
  if (!d) return
  event.preventDefault()
  const position = { x: block.position.x + d.x, y: block.position.y + d.y }
  if (!fitsInGrid(position, block.size)) return
  if (overlaps({ id: block.id, position, size: block.size }, store.draft.blocks)) return
  store.setBlockLayout(block.id, { position })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <p class="eyebrow">Lienzo · {{ GRID_COLUMNS }} columnas</p>
      <p class="font-mono text-[10px] text-steel-500">arrastra · <kbd class="rounded bg-sunken px-1">R</kbd> tamaño</p>
    </div>

    <div
      ref="gridEl"
      class="relative grid touch-none select-none rounded-xl bg-app/60 p-0"
      :class="drag ? 'ring-1 ring-ember/30' : ''"
      :style="{
        gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
        gridAutoRows: `${ROW_H}px`,
      }"
    >
      <!-- Guide underlay: faint at rest, ignites (ember) under the pointer while dragging. -->
      <div
        v-for="cell in guideCells"
        :key="`${cell.x},${cell.y}`"
        class="pointer-events-none border transition-colors duration-150"
        :style="{ gridColumn: `${cell.x + 1}`, gridRow: `${cell.y + 1}` }"
        :class="[
          drag ? 'border-steel-300/60' : 'border-line/40',
          inTarget(cell) ? (drag?.valid ? 'bg-ember/15 border-ember/60' : 'bg-alert/10 border-alert/50') : '',
        ]"
      />

      <!-- Blocks -->
      <div
        v-for="block in store.visibleBlocks"
        :key="block.id"
        class="relative z-10 p-1.5 outline-none"
        :style="cellStyle(block.position, block.size)"
        :class="[
          drag?.id === block.id ? 'opacity-40' : '',
          justDropped === block.id ? 'motion-safe:animate-[dropPulse_0.45s_ease-out]' : '',
        ]"
        tabindex="0"
        role="group"
        :aria-label="`Bloque ${block.id}. Flechas para mover, R para tamaño.`"
        @keydown="onKey(block, $event)"
      >
        <BlockWidget
          :block="block"
          :dragging="drag?.id === block.id"
          @grab="beginDrag(block, $event)"
          @resize="cycleSize(block)"
          @hide="store.hideBlock(block.id)"
        />
      </div>

      <!-- Ghost of a block being dragged in from the tray, snapped to the target cells. -->
      <div
        v-if="drag?.origin === 'tray' && drag.moved"
        class="pointer-events-none z-20 grid place-items-center gap-1 rounded-xl border-2 border-dashed p-1.5 text-center"
        :style="cellStyle(drag.target, drag.size)"
        :class="drag.valid ? 'border-ember bg-ember/10 text-ember-600' : 'border-alert/60 bg-alert/5 text-alert'"
      >
        <i class="pi text-[13px]" :class="BLOCK_META[drag.id].icon" />
        <span class="font-mono text-[10px] uppercase tracking-[0.08em]">{{ BLOCK_META[drag.id].label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes dropPulse {
  0% {
    box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ember) 70%, transparent);
  }
  100% {
    box-shadow: 0 0 0 2px transparent;
  }
}
</style>
