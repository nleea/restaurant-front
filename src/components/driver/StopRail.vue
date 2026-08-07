<script setup lang="ts">
// The signature: the whole run drawn as one vertical transit line. It is progress meter, list,
// and route order at once — three true things in one device. The current stop is passed down so
// its node glows ember; a connector is "travelled" once the stop above it is settled. The node
// number falls back to list order when a stop carries no route_position.
import { computed } from 'vue'
import StopNode from './StopNode.vue'
import type { DriverStop } from '@/services/delivery.api'

const props = defineProps<{
  stops: DriverStop[]
  nextStopId: string | null
}>()
const emit = defineEmits<{ open: [id: string] }>()

const TERMINAL = ['delivered', 'not_delivered']
const rows = computed(() =>
  props.stops.map((stop, i) => ({
    stop,
    position: stop.route_position ?? i + 1,
    first: i === 0,
    last: i === props.stops.length - 1,
    travelledIn: i > 0 ? TERMINAL.includes(props.stops[i - 1]?.delivery_status ?? 'pending') : false,
  })),
)
</script>

<template>
  <div>
    <StopNode
      v-for="row in rows"
      :key="row.stop.id"
      :stop="row.stop"
      :position="row.position"
      :is-next="row.stop.id === nextStopId"
      :first="row.first"
      :last="row.last"
      :travelled-in="row.travelledIn"
      @open="emit('open', $event)"
    />
  </div>
</template>
