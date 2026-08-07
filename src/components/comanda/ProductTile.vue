<script setup lang="ts">
// A tap target on the menu field. Single-variant products stamp on tap; multi-
// variant products bloom a popover on the tile to pick a size. Shows name, the
// (from) price in mono figures, the mono category tag, and a variant count.
import { computed, ref } from 'vue'
import VariantPopover from './VariantPopover.vue'
import { formatCOP } from '@/lib/money'

interface TileVariant {
  id: string
  label: string
  price: number
}

const props = defineProps<{
  product: { id: string; name: string; variants: TileVariant[] }
  tag: string
}>()
const emit = defineEmits<{ add: [variantId: string] }>()

const open = ref(false)
const multi = computed(() => props.product.variants.length > 1)
const fromPrice = computed(() => Math.min(...props.product.variants.map((v) => v.price)))

function onTap() {
  if (multi.value) {
    open.value = !open.value
    return
  }
  const only = props.product.variants[0]
  if (only) emit('add', only.id)
}

// From the variant popover: just the chosen size. The kitchen note is written afterwards
// on the dupe, where the field has room to be usable.
function pick(variantId: string) {
  open.value = false
  emit('add', variantId)
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="flex min-h-[92px] w-full flex-col justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-left transition hover:border-ember/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 active:scale-[0.98]"
      :aria-haspopup="multi ? 'menu' : undefined"
      :aria-expanded="multi ? open : undefined"
      @click="onTap"
    >
      <div class="flex w-full items-start justify-between gap-2">
        <span class="line-clamp-2 text-sm font-semibold leading-snug text-ink">{{ product.name }}</span>
        <span class="shrink-0 rounded font-mono text-[10px] font-bold tracking-widest text-steel-400">{{ tag }}</span>
      </div>
      <div class="flex w-full items-end justify-between gap-2">
        <span class="font-mono text-sm font-bold tabular-nums text-ink">
          <span v-if="multi" class="mr-0.5 text-[10px] font-normal text-steel-400">desde</span>{{ formatCOP(fromPrice) }}
        </span>
        <span
          v-if="multi"
          class="rounded-full bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-steel-500"
        >{{ product.variants.length }} tam.</span>
      </div>
    </button>

    <VariantPopover
      v-if="open"
      :variants="product.variants"
      @select="pick"
      @close="open = false"
    />
  </div>
</template>
