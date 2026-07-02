<script setup lang="ts">
// The recipe drawer, fed by the backend recipe card (`/recipes/variants/{id}/card`) loaded by
// `openRecipe` in useKdsBoard: `loading` while fetching, `card` with real data, and a quiet
// `none` state when the dish has no recipe (404) — never an error wall, never mock content.
import type { AllergenKey } from '@/services/recipes.api'
import { useKdsBoard } from './useKdsBoard'

const board = useKdsBoard()

const ALLERGEN_LABEL: Record<AllergenKey, string> = {
  gluten: 'gluten',
  dairy: 'lácteos',
  nuts: 'frutos secos',
  shellfish: 'mariscos',
  vegan: 'vegano',
}

function fmtQuantity(quantity: string): string {
  const n = Number(quantity)
  return Number.isFinite(n) ? String(n) : quantity
}
</script>

<template>
  <Transition name="kds-drawer">
    <div v-if="board.recipeDrawer.value" class="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <!-- overlay -->
      <div class="absolute inset-0 bg-black/40" @click="board.closeRecipe()" />

      <!-- panel -->
      <aside
        class="absolute right-0 top-0 flex h-full w-full flex-col bg-paper shadow-2xl sm:w-[380px]"
        @click.stop
      >
        <div class="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div class="min-w-0">
            <p v-if="board.recipeDrawer.value.station" class="eyebrow mb-1">
              Va a {{ board.stationMeta(board.recipeDrawer.value.station).label }}
            </p>
            <h2 class="truncate font-display text-xl font-extrabold text-ink">
              {{ board.recipeDrawer.value.itemName }}
            </h2>
          </div>
          <button
            type="button"
            class="rounded px-2 py-0.5 text-lg text-steel-500 transition hover:bg-sunken"
            aria-label="Cerrar receta"
            @click="board.closeRecipe()"
          >
            ×
          </button>
        </div>

        <!-- loading -->
        <div
          v-if="board.recipeDrawer.value.status === 'loading'"
          class="flex-1 px-5 py-10 text-center font-mono text-[12px] uppercase tracking-wide text-steel-500"
        >
          Cargando receta…
        </div>

        <!-- no recipe: quiet, not an error -->
        <div
          v-else-if="board.recipeDrawer.value.status === 'none'"
          class="flex-1 px-5 py-10 text-center"
        >
          <p class="font-mono text-[12px] uppercase tracking-wide text-steel-500">
            Sin receta para este plato
          </p>
          <p class="mt-2 text-[13px] text-muted">
            La ficha se arma desde Recetas (insumos, pasos y alérgenos de la variante).
          </p>
        </div>

        <!-- the card -->
        <div
          v-else-if="board.recipeDrawer.value.card"
          class="flex-1 space-y-5 overflow-y-auto px-5 py-4"
        >
          <div
            v-if="board.recipeDrawer.value.card.photo_label"
            class="grid h-40 place-items-center rounded-xl bg-sunken text-center font-mono text-[12px] uppercase tracking-wide text-steel-500"
          >
            {{ board.recipeDrawer.value.card.photo_label }}
          </div>

          <!-- allergens -->
          <div v-if="board.recipeDrawer.value.card.allergens.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="a in board.recipeDrawer.value.card.allergens"
              :key="a"
              class="pill"
              :class="a === 'vegan' ? 'pill-success' : 'pill-warn'"
            >
              {{ ALLERGEN_LABEL[a] }}
            </span>
          </div>

          <!-- ingredients -->
          <div v-if="board.recipeDrawer.value.card.ingredients.length">
            <p class="eyebrow mb-2">Ingredientes</p>
            <ul class="space-y-1">
              <li
                v-for="(ing, i) in board.recipeDrawer.value.card.ingredients"
                :key="i"
                class="flex items-baseline gap-2 text-[14px] text-ink"
              >
                <span class="text-ember">•</span>
                <span class="min-w-0 flex-1">{{ ing.name }}</span>
                <span class="shrink-0 font-mono text-[12px] tabular-nums text-steel-500">
                  {{ fmtQuantity(ing.quantity) }} {{ ing.unit }}
                </span>
              </li>
            </ul>
          </div>

          <!-- steps -->
          <div v-if="board.recipeDrawer.value.card.steps.length">
            <p class="eyebrow mb-2">Preparación</p>
            <ol class="space-y-2">
              <li
                v-for="(step, i) in board.recipeDrawer.value.card.steps"
                :key="i"
                class="flex gap-3 text-[14px] text-ink"
              >
                <span
                  class="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ember/15 font-mono text-[11px] font-bold text-ember-600"
                >
                  {{ i + 1 }}
                </span>
                <span>{{ step }}</span>
              </li>
            </ol>
          </div>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.kds-drawer-enter-active,
.kds-drawer-leave-active {
  transition: opacity 0.3s ease;
}
.kds-drawer-enter-active aside,
.kds-drawer-leave-active aside {
  transition: transform 0.3s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.kds-drawer-enter-from,
.kds-drawer-leave-to {
  opacity: 0;
}
.kds-drawer-enter-from aside,
.kds-drawer-leave-to aside {
  transform: translateX(100%);
}
@media (prefers-reduced-motion: reduce) {
  .kds-drawer-enter-active,
  .kds-drawer-leave-active,
  .kds-drawer-enter-active aside,
  .kds-drawer-leave-active aside {
    transition: none;
  }
}
</style>
