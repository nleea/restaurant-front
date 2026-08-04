<script setup lang="ts">
// Elegir un plato de la carta, en hoja inferior. Sirve para las dos cosas que el cliente puede
// hacer con el catálogo delante: añadir algo más y cambiar un plato por otro.
//
// Sólo lista lo vendible (`variantId` no nulo): un plato sin variante no se puede pedir, y
// ofrecerlo para que el servidor lo rechace después es prometer algo que no existe.
import { computed, ref } from 'vue'
import { formatCOP } from '@/lib/money'
import type { StorefrontCategory, StorefrontProduct } from '@/lib/storefront'

const props = defineProps<{
  title: string
  products: StorefrontProduct[]
  categories: StorefrontCategory[]
}>()
const emit = defineEmits<{ (e: 'pick', product: StorefrontProduct): void; (e: 'close'): void }>()

const query = ref('')
const sellable = computed(() => props.products.filter((p) => p.variantId))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? sellable.value.filter((p) => p.name.toLowerCase().includes(q)) : sellable.value
})
const categoryName = (id: string) => props.categories.find((c) => c.id === id)?.name ?? ''
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/40" @click.self="emit('close')">
    <div class="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-[var(--sf-bg)] text-[var(--sf-text)]">
      <div class="flex items-center gap-3 border-b border-[var(--sf-line)] px-5 py-4">
        <h2 class="flex-1 text-base font-bold">{{ title }}</h2>
        <button
          type="button"
          class="grid size-8 place-items-center rounded-full border border-[var(--sf-line)] text-[var(--sf-muted)]"
          aria-label="Cerrar"
          @click="emit('close')"
        >
          <i class="pi pi-times text-[12px]" />
        </button>
      </div>

      <div class="px-5 pt-3">
        <input
          v-model="query"
          type="search"
          placeholder="Buscar en la carta"
          class="w-full rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-2 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
        />
      </div>

      <ul class="flex-1 overflow-y-auto px-5 py-3">
        <li v-for="p in filtered" :key="p.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 border-b border-[var(--sf-line)] py-3 text-left transition active:scale-[0.995]"
            @click="emit('pick', p)"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] font-semibold">{{ p.name }}</span>
              <span class="block truncate text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">
                {{ categoryName(p.categoryId) }}
              </span>
            </span>
            <span class="shrink-0 font-mono text-[13px] tabular-nums text-[var(--sf-primary)]">
              {{ formatCOP(p.price) }}
            </span>
          </button>
        </li>
        <li v-if="!filtered.length" class="py-8 text-center text-[13px] text-[var(--sf-muted)]">
          No encontramos ese plato.
        </li>
      </ul>
    </div>
  </div>
</template>
