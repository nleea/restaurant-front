<script setup lang="ts">
// The reusable state chip. Driver-facing Spanish labels over the exact El Pase semantic palette
// already used by the dispatcher board (pending=warn, in_transit=info, delivered=success,
// not_delivered=alert), plus the pre-depart `assigned` state as a quiet neutral chip — status is
// the one thing colour is spent on.
import { computed } from 'vue'
import type { DriverStop } from '@/services/delivery.api'

const props = defineProps<{ status: DriverStop['delivery_status'] }>()

const MAP: Record<DriverStop['delivery_status'], { label: string; pill: string; dot: string }> = {
  pending: { label: 'Pendiente', pill: 'pill-warn', dot: 'bg-warn' },
  assigned: { label: 'Asignado', pill: 'pill-neutral', dot: 'bg-steel-400' },
  in_transit: { label: 'En camino', pill: 'pill-info', dot: 'bg-info' },
  delivered: { label: 'Entregado', pill: 'pill-success', dot: 'bg-success' },
  not_delivered: { label: 'No entregado', pill: 'pill-alert', dot: 'bg-alert' },
  // No debería llegar aquí —sólo se cancela la entrega que nunca se asignó— pero un estado que
  // esta pantalla no conoce sale como literal crudo en el móvil del domiciliario.
  cancelled: { label: 'Cancelado', pill: 'pill-neutral', dot: 'bg-steel-400' },
}

const meta = computed(() => MAP[props.status])
</script>

<template>
  <span class="pill" :class="meta.pill">
    <span class="size-1.5 rounded-full" :class="meta.dot" aria-hidden="true" />
    {{ meta.label }}
  </span>
</template>
