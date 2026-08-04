<script setup lang="ts">
// Product detail as a bottom-sheet: quantity, addons, ingredients to exclude, and a free note, with
// a live-recalculated "Agregar/Actualizar" button. Reused for editing a line already in the cart
// (prefilled from `editing`). Emits the built line config; the parent decides add vs update.
import { computed, ref } from 'vue'
import type { Addon, CartItem, StorefrontProduct } from '@/lib/storefront'
import type { CartItemConfig } from '@/stores/cart'
import type { DishDetailConfig, DishDetailSectionId } from '@/lib/menuAppearance'
import { DEFAULT_DISH_DETAIL } from '@/lib/menuAppearance'
import { formatCOP } from '@/lib/money'

// `addons` is the fetched addon directory; the sheet shows only those available for this product.
// `detail` (from the appearance config) decides which sections show, so /store matches the panel.
const props = defineProps<{
  product: StorefrontProduct
  editing: CartItem | null
  addons: Addon[]
  detail?: DishDetailConfig
}>()
const emit = defineEmits<{ (e: 'submit', config: CartItemConfig): void; (e: 'close'): void }>()

const shownSections = computed(
  () => new Set((props.detail ?? DEFAULT_DISH_DETAIL).sections.filter((s) => s.visible).map((s) => s.id)),
)
function shows(id: DishDetailSectionId): boolean {
  return shownSections.value.has(id)
}

const availableAddons = computed<Addon[]>(() =>
  props.addons.filter((a) => props.product.addonIds.includes(a.id)),
)

// Prefill from the line being edited, else start fresh.
const quantity = ref(props.editing?.quantity ?? 1)
const selectedAddonIds = ref<string[]>(props.editing?.addons.map((a) => a.id) ?? [])
const removed = ref<string[]>([...(props.editing?.removed ?? [])])
const note = ref(props.editing?.note ?? '')

function toggleAddon(id: string) {
  selectedAddonIds.value = selectedAddonIds.value.includes(id)
    ? selectedAddonIds.value.filter((x) => x !== id)
    : [...selectedAddonIds.value, id]
}
function toggleIngredient(ing: string) {
  removed.value = removed.value.includes(ing)
    ? removed.value.filter((x) => x !== ing)
    : [...removed.value, ing]
}

const chosenAddons = computed(() => availableAddons.value.filter((a) => selectedAddonIds.value.includes(a.id)))
const unitPrice = computed(() => props.product.price + chosenAddons.value.reduce((s, a) => s + a.price, 0))
const liveTotal = computed(() => unitPrice.value * quantity.value)

function submit() {
  emit('submit', {
    productId: props.product.id,
    variantId: props.product.variantId,
    name: props.product.name,
    unitPrice: props.product.price,
    quantity: quantity.value,
    addons: chosenAddons.value,
    removed: removed.value,
    note: note.value.trim(),
  })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" :aria-label="product.name">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50 motion-safe:animate-[sfFade_0.2s_ease]" @click="emit('close')" />

    <!-- Sheet -->
    <div class="relative flex max-h-[92vh] flex-col rounded-t-3xl bg-[var(--sf-bg)] text-[var(--sf-text)] motion-safe:animate-[sfSheetUp_0.28s_cubic-bezier(0.2,0.7,0.2,1)]">
      <!-- Hero -->
      <div v-if="shows('photo')" class="relative grid h-40 shrink-0 place-items-center overflow-hidden rounded-t-3xl">
        <img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" class="size-full object-cover" />
        <div v-else class="grid size-full place-items-center" :style="{ background: 'linear-gradient(135deg, color-mix(in oklab, var(--sf-primary) 22%, var(--sf-bg)), color-mix(in oklab, var(--sf-secondary) 26%, var(--sf-bg)))' }">
          <span class="text-5xl">{{ product.emoji ?? '🍽️' }}</span>
        </div>
      </div>

      <!-- Close (sheet-level, so it survives a hidden photo) -->
      <button type="button" class="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60" aria-label="Cerrar" @click="emit('close')">
        <i class="pi pi-times text-sm" />
      </button>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <h2 class="text-xl font-bold leading-tight">{{ product.name }}</h2>
        <p v-if="shows('description')" class="mt-1 text-[13px] leading-relaxed text-[var(--sf-muted)]">{{ product.description }}</p>
        <p class="mt-2 font-mono text-lg font-bold tabular-nums text-[var(--sf-accent)]">{{ formatCOP(product.price) }}</p>

        <!-- Addons -->
        <div v-if="shows('addons') && availableAddons.length" class="mt-5">
          <p class="text-[13px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Adiciones</p>
          <div class="mt-2 flex flex-col gap-1.5">
            <label
              v-for="a in availableAddons"
              :key="a.id"
              class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition"
              :class="selectedAddonIds.includes(a.id) ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_8%,transparent)]' : 'border-[var(--sf-line)] bg-[var(--sf-surface)]'"
            >
              <input type="checkbox" class="size-4 accent-[var(--sf-primary)]" :checked="selectedAddonIds.includes(a.id)" @change="toggleAddon(a.id)" />
              <span class="flex-1 text-[14px]">{{ a.name }}</span>
              <span class="font-mono text-[13px] tabular-nums text-[var(--sf-muted)]">+{{ formatCOP(a.price) }}</span>
            </label>
          </div>
        </div>

        <!-- Removable ingredients -->
        <div v-if="shows('remove') && product.removableIngredients.length" class="mt-5">
          <p class="text-[13px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Personaliza</p>
          <p class="text-[11px] text-[var(--sf-muted)]">Desmarca lo que no quieras en tu plato.</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              v-for="ing in product.removableIngredients"
              :key="ing"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition"
              :class="removed.includes(ing) ? 'border-[var(--sf-line)] bg-transparent text-[var(--sf-muted)] line-through' : 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_8%,transparent)] text-[var(--sf-text)]'"
              @click="toggleIngredient(ing)"
            >
              <i class="pi text-[10px]" :class="removed.includes(ing) ? 'pi-times' : 'pi-check'" />
              {{ ing }}
            </button>
          </div>
        </div>

        <!-- Note -->
        <div v-if="shows('note')" class="mt-5">
          <label class="text-[13px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]" for="sf-note">Nota para la cocina</label>
          <textarea
            id="sf-note"
            v-model="note"
            rows="2"
            maxlength="140"
            placeholder="Ej. término de la carne, sin picante…"
            class="mt-1.5 w-full resize-none rounded-xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-3 py-2 text-[14px] text-[var(--sf-text)] outline-none placeholder:text-[var(--sf-muted)] focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
          />
        </div>
      </div>

      <!-- Sticky action bar -->
      <div class="flex shrink-0 items-center gap-3 border-t border-[var(--sf-line)] bg-[var(--sf-bg)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div class="inline-flex items-center overflow-hidden rounded-full border border-[var(--sf-line)]">
          <button type="button" class="grid size-10 place-items-center transition active:bg-[var(--sf-line)]" aria-label="Menos" @click="quantity = Math.max(1, quantity - 1)">
            <i class="pi pi-minus text-xs" />
          </button>
          <span class="w-8 text-center font-mono text-[15px] font-bold tabular-nums">{{ quantity }}</span>
          <button type="button" class="grid size-10 place-items-center transition active:bg-[var(--sf-line)]" aria-label="Más" @click="quantity = quantity + 1">
            <i class="pi pi-plus text-xs" />
          </button>
        </div>
        <button
          type="button"
          class="flex flex-1 items-center justify-between gap-2 rounded-full bg-[var(--sf-primary)] px-5 py-3 font-semibold text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2"
          @click="submit"
        >
          <span>{{ editing ? 'Actualizar' : 'Agregar' }}</span>
          <span class="font-mono tabular-nums">{{ formatCOP(liveTotal) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes sfSheetUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes sfFade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
