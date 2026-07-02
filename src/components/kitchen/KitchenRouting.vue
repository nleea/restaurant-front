<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import { useBranchStore } from '@/stores/branch'
import { useKitchenStore } from '@/stores/kitchen'
import { useOrdersStore } from '@/stores/orders'
import { formatCOP } from '@/lib/money'

const branch = useBranchStore()
const kitchen = useKitchenStore()
const orders = useOrdersStore()

const loading = ref(false)
const error = ref<string | null>(null)
const routingId = ref<string | null>(null)
const routed = ref<Set<string>>(new Set())

async function load() {
  if (!branch.activeBranchId) return
  loading.value = true
  error.value = null
  try {
    await orders.loadOrders(branch.activeBranchId, 'open')
  } catch {
    error.value = 'No se pudieron cargar las comandas.'
  } finally {
    loading.value = false
  }
}

async function route(orderId: string) {
  routingId.value = orderId
  error.value = null
  try {
    await kitchen.routeOrder(orderId)
    routed.value.add(orderId)
  } catch {
    error.value = 'No se pudo enviar la comanda a cocina.'
  } finally {
    routingId.value = null
  }
}

function channelLabel(c: string): string {
  return c === 'dine_in' ? 'Mesa' : c === 'takeaway' ? 'Para llevar' : 'Domicilio'
}

onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">
        Comandas abiertas
      </h2>
      <Button
        label="Actualizar"
        size="small"
        outlined
        icon="pi pi-refresh"
        :loading="loading"
        @click="load"
      />
    </div>

    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
    >
      {{ error }}
    </p>

    <p v-if="loading" class="text-steel-500">Cargando…</p>
    <p v-else-if="!orders.orders.length" class="text-steel-500">No hay comandas abiertas.</p>

    <ul v-else class="flex flex-col gap-1.5">
      <li
        v-for="o in orders.orders"
        :key="o.id"
        class="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3"
      >
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium text-ink">{{ channelLabel(o.channel) }}</span>
          <span class="font-mono text-[10px] uppercase tracking-wide text-steel-500">
            {{ formatCOP(o.total) }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-2">
          <span
            v-if="routed.has(o.id)"
            class="font-mono text-[10px] uppercase tracking-wide text-ember"
          >
            Enviado
          </span>
          <Button
            label="Enviar a cocina"
            size="small"
            icon="pi pi-send"
            :loading="routingId === o.id"
            @click="route(o.id)"
          />
        </span>
      </li>
    </ul>
  </div>
</template>
