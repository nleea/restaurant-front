<script setup lang="ts">
import { computed } from 'vue'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'
import { formatCOP } from '@/lib/money'
import type { TableVM } from '@/lib/floorModel'

const props = defineProps<{ vm: TableVM; canOpen: boolean; opening: boolean; openError: string | null }>()
const emit = defineEmits<{ 'take-order': []; 'open-ticket': []; close: [] }>()

const auth = useAuthStore()
const table = computed(() => props.vm.table)
const canUpdate = computed(() => auth.can('orders.update'))
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
      <div class="min-w-0">
        <p class="eyebrow">Mesa</p>
        <p class="font-mono text-2xl font-semibold leading-tight text-ink tabular-nums">{{ table.number }}</p>
        <p class="mt-0.5 text-xs text-steel-500">
          {{ vm.isOccupied ? 'Ocupada' : 'Libre' }} · {{ table.capacity }} puestos
        </p>
      </div>
      <button
        type="button"
        class="grid size-8 shrink-0 place-items-center rounded-md border border-line text-steel-500 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
        aria-label="Cerrar panel"
        @click="emit('close')"
      >
        <i class="pi pi-times text-sm" />
      </button>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4">
      <!-- Occupied: order summary + open the ticket (pay/close/cancel live there) -->
      <template v-if="vm.isOccupied && vm.openOrder">
        <div class="mb-4 rounded-xl border border-line bg-app/60 px-3 py-2.5">
          <div class="flex items-center justify-between">
            <span class="eyebrow">Comanda</span>
            <span class="pill pill-warn">{{ vm.openOrder.status }}</span>
          </div>
          <div class="mt-2 flex justify-between font-mono text-sm font-semibold text-ink">
            <span>Total</span>
            <span class="tabular-nums text-ember-600">{{ formatCOP(vm.openOrder.total) }}</span>
          </div>
        </div>
        <Button
          label="Ver / editar comanda"
          icon="pi pi-list"
          class="w-full !justify-start"
          @click="emit('open-ticket')"
        />
        <p class="mt-2 font-mono text-[11px] text-steel-500">
          Agregar ítems, cobrar, cerrar o cancelar desde el ticket.
        </p>
      </template>

      <!-- Free: open a dine-in order on this table -->
      <template v-else>
        <p class="mb-3 text-sm text-steel-500">La mesa está libre.</p>
        <Button
          label="Tomar comanda"
          icon="pi pi-pencil"
          class="w-full !justify-start"
          :loading="opening"
          :disabled="!canOpen || !canUpdate"
          @click="emit('take-order')"
        />
        <p v-if="!canOpen" class="mt-2 font-mono text-[11px] text-steel-500">
          Tu usuario no está vinculado a un empleado; no puedes abrir comandas.
        </p>
        <p
          v-if="openError"
          role="alert"
          class="mt-2 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ openError }}
        </p>
      </template>
    </div>
  </div>
</template>
