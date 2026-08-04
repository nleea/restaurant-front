<script setup lang="ts">
// One stamped line on the dupe: "qty × name … price", with ± steppers to bump or
// remove. Items are born PENDIENTE and flip to EN COCINA once sent (see `sent`), so
// the line carries its kitchen state and any free-text note captured at add. Flashes
// briefly when freshly stamped (reduced-motion honored in CSS).
import { formatCOP } from '@/lib/money'

interface Row {
  id: string
  name: string
  unitPrice: number
  qty: number
  lineTotal: number
  sent: boolean
  note: string | null
}

defineProps<{ line: Row; flash: boolean; editable: boolean }>()
const emit = defineEmits<{ bump: [delta: number]; remove: []; note: [] }>()
</script>

<template>
  <li
    class="flex items-center gap-2 py-2"
    :class="flash ? 'stamp-flash' : ''"
  >
    <!-- Stepper (edit-gated) -->
    <div
      v-if="editable"
      class="flex shrink-0 items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
    >
      <button
        type="button"
        class="grid size-8 place-items-center rounded-md text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :aria-label="line.qty > 1 ? `Quitar una unidad de ${line.name}` : `Eliminar ${line.name}`"
        @click="line.qty > 1 ? emit('bump', -1) : emit('remove')"
      >
        <i class="pi text-xs" :class="line.qty > 1 ? 'pi-minus' : 'pi-trash'" />
      </button>
      <span class="w-6 text-center font-mono text-sm font-bold tabular-nums text-ink">{{ line.qty }}</span>
      <button
        type="button"
        class="grid size-8 place-items-center rounded-md text-steel-500 transition hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :aria-label="`Agregar otra de ${line.name}`"
        @click="emit('bump', 1)"
      >
        <i class="pi pi-plus text-xs" />
      </button>
    </div>
    <span v-else class="w-8 shrink-0 text-center font-mono text-sm font-bold tabular-nums text-ink">×{{ line.qty }}</span>

    <!-- Name + note + unit price + kitchen state -->
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-ink">{{ line.name }}</p>

      <!-- The note IS the affordance: tap it to edit, or "Nota" to write the first one.
           Read-only dupes (closed order / no permission) just render the text. -->
      <button
        v-if="editable"
        type="button"
        class="-ml-1 flex min-h-7 max-w-full items-center gap-1 rounded px-1 text-left font-mono text-[11px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :class="line.note ? 'text-steel-500 hover:text-ember' : 'text-steel-400 hover:text-ember'"
        :aria-label="line.note ? `Editar la nota de ${line.name}` : `Agregar una nota a ${line.name}`"
        @click="emit('note')"
      >
        <i class="pi text-[9px]" :class="line.note ? 'pi-pencil' : 'pi-plus'" aria-hidden="true" />
        <span class="truncate">{{ line.note ?? 'Nota' }}</span>
      </button>
      <p v-else-if="line.note" class="truncate font-mono text-[11px] leading-tight text-steel-500">
        · {{ line.note }}
      </p>
      <p class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-steel-400">
        <span>{{ formatCOP(line.unitPrice) }} c/u</span>
        <span class="text-steel-300">·</span>
        <span
          class="inline-flex items-center rounded px-1 py-px text-[10px] font-semibold not-italic normal-nums uppercase tracking-wide"
          :class="line.sent ? 'text-steel-500' : 'bg-warn/15 text-warn-600'"
        >{{ line.sent ? 'En cocina' : 'Pendiente' }}</span>
      </p>
    </div>

    <!-- Line total -->
    <span class="shrink-0 font-mono text-sm font-semibold tabular-nums text-ink">{{ formatCOP(line.lineTotal) }}</span>
  </li>
</template>

<style scoped>
@keyframes stamp-flash {
  0% {
    background-color: color-mix(in oklab, var(--color-ember) 22%, transparent);
    transform: scale(1.015);
  }
  100% {
    background-color: transparent;
    transform: none;
  }
}
.stamp-flash {
  animation: stamp-flash 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@media (prefers-reduced-motion: reduce) {
  .stamp-flash {
    animation: none;
  }
}
</style>
