<script setup lang="ts">
// The pass — the KDS board composition embedded in KitchenView's "Pase" area. A wall/counter
// screen for the line, glanced at from 2 m under real heat lamps: dark field so the ember/alert
// heat is the only thing that pulls the eye. Data is real (kitchen store via the adapter); this
// component only assembles the chrome.
import { computed, onMounted, onUnmounted } from 'vue'
import KdsDocket from '@/components/kds/KdsDocket.vue'
import KdsExpoPanel from '@/components/kds/KdsExpoPanel.vue'
import KdsMyStation from '@/components/kds/KdsMyStation.vue'
import KdsRecipeDrawer from '@/components/kds/KdsRecipeDrawer.vue'
import KdsStationRail from '@/components/kds/KdsStationRail.vue'
import KdsTopBar from '@/components/kds/KdsTopBar.vue'
import { useKdsBoard } from '@/components/kds/useKdsBoard'

const board = useKdsBoard()
const light = computed(() => board.theme.value === 'light')

onMounted(() => board.start())
onUnmounted(() => board.stop())
</script>

<template>
  <div class="min-h-[70vh]" :class="light ? 'bg-app' : 'bg-pass'">
    <!-- Chrome always rides the dark pass rail so the clock/heat read at a glance -->
    <div class="sticky top-0 z-30 border-b border-white/10 bg-graphite-900">
      <div class="mx-auto max-w-[1600px]">
        <KdsTopBar :light="light" />
      </div>
      <KdsExpoPanel />
    </div>

    <div class="mx-auto max-w-[1600px] px-4 py-4">
      <div class="mb-4">
        <KdsStationRail :light="light" />
      </div>

      <!-- My-station list view -->
      <KdsMyStation v-if="board.viewMode.value === 'mystation'" :now="board.now.value" :light="light" />

      <!-- The pass: the docket grid -->
      <template v-else>
        <p
          v-if="!board.pagedOrders.value.length"
          class="rounded-xl border px-4 py-16 text-center font-mono text-[13px]"
          :class="light ? 'border-line text-steel-500' : 'border-white/10 text-paper/45'"
        >
          Sin comandas en el pase.
        </p>
        <div
          v-else
          class="grid items-start gap-4"
          :class="
            board.layout.value === 'list'
              ? 'grid-cols-1 mx-auto max-w-3xl'
              : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 min-[2000px]:grid-cols-4'
          "
        >
          <KdsDocket
            v-for="order in board.pagedOrders.value"
            :key="order.id"
            :order="order"
            :now="board.now.value"
            :light="light"
          />
        </div>
      </template>
    </div>

    <KdsRecipeDrawer />
  </div>
</template>
