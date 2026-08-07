<script setup lang="ts">
// "Plato · Detalle": the order and visibility of the dish-detail screen's sections. Same ordered-list
// model as the layout blocks, minus the 2D grid (the detail is one column). Up/down reorders; the
// switch hides a section. The dish-detail preview reflects both live.
import { computed } from 'vue'
import { DISH_DETAIL_META } from '@/lib/menuAppearance'
import { useMenuAppearanceStore } from '@/stores/menuAppearance'

const store = useMenuAppearanceStore()
const sections = computed(() => store.dishDetail.sections)

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= sections.value.length) return
  const next = sections.value.map((s) => ({ ...s }))
  const a = next[index]
  const b = next[target]
  if (!a || !b) return
  next[index] = b
  next[target] = a
  store.setDishDetailOrder(next)
}
</script>

<template>
  <section class="flex flex-col gap-2">
    <p class="eyebrow">Secciones del detalle</p>
    <p class="mb-1 text-[12px] text-muted">Ordena y muestra/oculta lo que el cliente ve al abrir un plato.</p>

    <ul class="flex flex-col gap-1.5">
      <li
        v-for="(s, i) in sections"
        :key="s.id"
        class="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2"
      >
        <div class="flex flex-col">
          <button
            type="button"
            class="text-steel-400 transition hover:text-ember disabled:opacity-30 focus-visible:outline-none"
            :disabled="i === 0"
            aria-label="Subir"
            @click="move(i, -1)"
          >
            <i class="pi pi-chevron-up text-[10px]" />
          </button>
          <button
            type="button"
            class="text-steel-400 transition hover:text-ember disabled:opacity-30 focus-visible:outline-none"
            :disabled="i === sections.length - 1"
            aria-label="Bajar"
            @click="move(i, 1)"
          >
            <i class="pi pi-chevron-down text-[10px]" />
          </button>
        </div>

        <i class="pi text-[12px] text-steel-500" :class="DISH_DETAIL_META[s.id].icon" />
        <span class="flex-1 text-[13px]" :class="s.visible ? 'text-ink' : 'text-steel-400 line-through'">
          {{ DISH_DETAIL_META[s.id].label }}
        </span>

        <button
          type="button"
          role="switch"
          :aria-checked="s.visible"
          class="relative h-5 w-9 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          :class="s.visible ? 'bg-ember' : 'bg-line'"
          @click="store.toggleDishDetailSection(s.id)"
        >
          <span class="absolute top-0.5 size-4 rounded-full bg-white transition-all" :class="s.visible ? 'left-4' : 'left-0.5'" />
        </button>
      </li>
    </ul>
  </section>
</template>
