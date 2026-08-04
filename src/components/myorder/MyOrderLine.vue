<script setup lang="ts">
// Una línea de la comanda del cliente. Dos estados y ninguno escondido:
//
// - **Se puede corregir** → renglón a lápiz: casillas de exclusión, nota y cantidad hacia arriba.
// - **Ya no** → renglón sellado, con el motivo escrito al lado ("ya lo están preparando"). El
//   control no desaparece: se apaga y se explica. Un botón que se esfuma deja al cliente
//   preguntándose si lo soñó.
//
// Bajar la cantidad y quitar no tienen control aquí, y tampoco un botón muerto: no son un permiso
// que falte, son otra conversación (la de abajo, con una persona).
import { computed } from 'vue'
import { formatCOP } from '@/lib/money'
import type { Addon } from '@/lib/storefront'
import type { LineDraft } from '@/lib/myOrder'
import { lineDelta } from '@/lib/myOrder'
import type { MyOrderLine } from '@/services/myOrder.api'

const props = defineProps<{
  line: MyOrderLine
  draft: LineDraft
  /** Directorio de adiciones del catálogo (para nombres y precios). */
  addons: Addon[]
  /** Las adiciones que admite ESTE plato. */
  availableAddonIds: string[]
  /** Abierto = mostrando los controles. Lo gobierna el padre: sólo uno a la vez. */
  open: boolean
}>()
const emit = defineEmits<{
  (e: 'patch', patch: Partial<LineDraft>): void
  (e: 'toggle'): void
  (e: 'swap'): void
}>()

const addonPrice = (id: string) => props.addons.find((a) => a.id === id)?.price ?? 0
const delta = computed(() => lineDelta(props.line, props.draft, addonPrice))

// Las que ya están puestas no se pueden quitar (crecer sí, encoger no), así que no se ofrecen.
const offerableAddons = computed(() =>
  props.addons.filter(
    (a) => props.availableAddonIds.includes(a.id) && !props.line.addons.some((x) => x.id === a.id),
  ),
)

function toggleIngredient(name: string) {
  const has = props.draft.removedIngredients.includes(name)
  emit('patch', {
    removedIngredients: has
      ? props.draft.removedIngredients.filter((x) => x !== name)
      : [...props.draft.removedIngredients, name],
  })
}
function toggleAddon(id: string) {
  const has = props.draft.addAddonIds.includes(id)
  emit('patch', {
    addAddonIds: has
      ? props.draft.addAddonIds.filter((x) => x !== id)
      : [...props.draft.addAddonIds, id],
  })
}
</script>

<template>
  <li class="font-mono text-[13px]" :class="line.editable ? '' : 'opacity-70'">
    <div class="flex items-baseline gap-2">
      <span class="tabular-nums text-[var(--sf-muted)]">{{ draft.quantity }}×</span>
      <span class="min-w-0 flex-1 font-sans font-semibold leading-tight">{{ line.name }}</span>
      <span class="shrink-0 tabular-nums">{{ formatCOP(line.lineSubtotal) }}</span>
    </div>

    <!-- Lo que ya lleva, como sub-renglones de recibo -->
    <div class="mt-0.5 space-y-0.5 pl-6 text-[11px] text-[var(--sf-muted)]">
      <p v-for="a in line.addons" :key="a.id">+ {{ a.name }}</p>
      <p v-for="r in draft.removedIngredients" :key="r">− sin {{ r.toLowerCase() }}</p>
      <p v-if="draft.note" class="italic">“{{ draft.note }}”</p>
      <p v-for="id in draft.addAddonIds" :key="id" class="text-[var(--sf-primary)]">
        + {{ addons.find((a) => a.id === id)?.name }}
      </p>
    </div>

    <!-- Sellado: no se puede tocar, y se dice por qué -->
    <p
      v-if="!line.editable"
      class="mt-1.5 ml-6 inline-flex items-center gap-1.5 rounded-sm border border-dashed border-[var(--sf-line)] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--sf-muted)]"
    >
      <i class="pi pi-lock text-[9px]" />
      {{ line.reason ?? 'No se puede cambiar' }}
    </p>

    <template v-else>
      <div class="mt-1.5 flex items-center gap-3 pl-6">
        <button
          type="button"
          class="font-mono text-[11px] uppercase tracking-wide text-[var(--sf-muted)] underline-offset-2 transition hover:text-[var(--sf-primary)] hover:underline"
          :aria-expanded="open"
          @click="emit('toggle')"
        >
          {{ open ? 'Listo' : 'Corregir' }}
        </button>
        <span v-if="delta > 0" class="ml-auto tabular-nums text-[11px] text-[var(--sf-primary)]">
          +{{ formatCOP(delta) }}
        </span>
      </div>

      <div v-if="open" class="mt-2 ml-6 flex flex-col gap-3 border-l border-dashed border-[var(--sf-line)] pl-3">
        <!-- Cantidad: sólo hacia arriba -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">Cantidad</span>
          <div class="inline-flex items-center overflow-hidden rounded-full border border-[var(--sf-line)]">
            <button
              type="button"
              class="grid size-7 place-items-center text-[var(--sf-muted)] transition disabled:opacity-40"
              :disabled="draft.quantity <= line.quantity"
              aria-label="Quitar uno"
              @click="emit('patch', { quantity: draft.quantity - 1 })"
            >
              <i class="pi pi-minus text-[10px]" />
            </button>
            <span class="w-6 text-center font-mono text-[12px] tabular-nums">{{ draft.quantity }}</span>
            <button
              type="button"
              class="grid size-7 place-items-center text-[var(--sf-text)] transition hover:bg-[var(--sf-line)]"
              aria-label="Agregar uno"
              @click="emit('patch', { quantity: draft.quantity + 1 })"
            >
              <i class="pi pi-plus text-[10px]" />
            </button>
          </div>
          <span v-if="draft.quantity <= line.quantity" class="text-[10px] text-[var(--sf-muted)]">
            Para pedir menos, escríbenos
          </span>
        </div>

        <!-- Exclusiones: lo que ya estaba llega marcado -->
        <div v-if="line.removableIngredients.length" class="flex flex-col gap-1.5">
          <span class="text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">Sin…</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="ing in line.removableIngredients"
              :key="ing"
              type="button"
              class="rounded-full border px-2.5 py-1 font-sans text-[12px] transition"
              :class="
                draft.removedIngredients.includes(ing)
                  ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_14%,transparent)] text-[var(--sf-text)]'
                  : 'border-[var(--sf-line)] text-[var(--sf-muted)]'
              "
              :aria-pressed="draft.removedIngredients.includes(ing)"
              @click="toggleIngredient(ing)"
            >
              Sin {{ ing.toLowerCase() }}
            </button>
          </div>
        </div>

        <!-- Adiciones que este plato admite y aún no lleva -->
        <div v-if="offerableAddons.length" class="flex flex-col gap-1.5">
          <span class="text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">Añadir</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="a in offerableAddons"
              :key="a.id"
              type="button"
              class="rounded-full border px-2.5 py-1 font-sans text-[12px] transition"
              :class="
                draft.addAddonIds.includes(a.id)
                  ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_14%,transparent)] text-[var(--sf-text)]'
                  : 'border-[var(--sf-line)] text-[var(--sf-muted)]'
              "
              :aria-pressed="draft.addAddonIds.includes(a.id)"
              @click="toggleAddon(a.id)"
            >
              + {{ a.name }} · {{ formatCOP(a.price) }}
            </button>
          </div>
        </div>

        <!-- Nota libre: se edita la que ya había, no se pide reescribirla -->
        <label class="flex flex-col gap-1">
          <span class="text-[11px] uppercase tracking-wide text-[var(--sf-muted)]">Nota</span>
          <textarea
            :value="draft.note"
            rows="2"
            maxlength="255"
            placeholder="Algo más que debamos saber"
            class="w-full resize-none rounded-lg border border-[var(--sf-line)] bg-[var(--sf-surface)] px-2.5 py-1.5 font-sans text-[13px] text-[var(--sf-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
            @input="emit('patch', { note: ($event.target as HTMLTextAreaElement).value })"
          />
        </label>

        <button
          type="button"
          class="self-start font-mono text-[11px] uppercase tracking-wide text-[var(--sf-muted)] underline-offset-2 transition hover:text-[var(--sf-primary)] hover:underline"
          @click="emit('swap')"
        >
          Cambiar por otro plato
        </button>
      </div>
    </template>
  </li>
</template>
