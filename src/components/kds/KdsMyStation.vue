<script setup lang="ts">
import { computed } from 'vue'
import { itemAlert, minutesSince, orderElapsedMin } from '@/lib/kds/logic'
import type { KdsComponent } from '@/lib/kds/types'
import { useKdsBoard } from './useKdsBoard'

const props = defineProps<{ now: number; light: boolean }>()
const board = useKdsBoard()

interface Row {
  orderId: string
  table: string
  itemName: string
  component: KdsComponent
  itemId: string
  elapsed: number
  rank: number
  bucket: 'critical' | 'urgent' | 'warn' | 'cooking' | 'pending' | 'done'
}

// Flatten every component at the cook's station into a single urgency-ranked list. A component
// that the whole dish is waiting on inherits the item's alert severity — that's what to fire next.
const rows = computed<Row[]>(() => {
  const station = board.myStation.value
  const out: Row[] = []
  if (!station) return out
  for (const o of board.liveOrders.value) {
    if (o.bumpedAt !== null) continue
    for (const item of o.items) {
      const alert = itemAlert(item, props.now)
      for (const c of item.components) {
        if (c.station !== station) continue
        let bucket: Row['bucket']
        let rank: number
        if (c.status === 'done') {
          bucket = 'done'
          rank = 0
        } else if (alert && alert.waitingStation === station) {
          bucket = alert.severity as Row['bucket']
          rank = alert.severity === 'critical' ? 5 : alert.severity === 'urgent' ? 4 : 3
        } else if (c.status === 'cooking') {
          bucket = 'cooking'
          rank = 2
        } else {
          bucket = 'pending'
          rank = 1
        }
        out.push({
          orderId: o.id,
          table: o.table,
          itemName: item.name,
          component: c,
          itemId: item.id,
          elapsed: c.status === 'done' && c.doneAt ? minutesSince(c.doneAt, props.now) : orderElapsedMin(o, props.now),
          rank,
          bucket,
        })
      }
    }
  }
  return out.sort((a, b) => b.rank - a.rank || b.elapsed - a.elapsed)
})

const rowBg: Record<Row['bucket'], string> = {
  critical: 'bg-alert/25',
  urgent: 'bg-alert/10',
  warn: 'bg-warn/10',
  cooking: '',
  pending: '',
  done: 'opacity-40',
}
</script>

<template>
  <div>
    <p class="eyebrow mb-3" :class="light ? '' : 'text-paper/45'">
      Mi estación · {{ board.myStation.value ? board.stationMeta(board.myStation.value).label : '—' }} — {{ rows.length }} componentes
    </p>

    <p
      v-if="!rows.length"
      class="rounded-xl border px-4 py-10 text-center font-mono text-[12px]"
      :class="light ? 'border-line text-steel-500' : 'border-white/10 text-paper/45'"
    >
      Sin componentes en esta estación.
    </p>

    <ul v-else class="overflow-hidden rounded-xl" :class="light ? 'bg-surface ring-1 ring-line' : 'bg-white/[0.03] ring-1 ring-white/10'">
      <li
        v-for="row in rows"
        :key="row.component.id"
        class="flex cursor-pointer items-center gap-3 border-b px-4 py-2.5 transition last:border-0"
        :class="[light ? 'border-line hover:bg-sunken' : 'border-white/5 hover:bg-white/[0.06]', rowBg[row.bucket]]"
        @click="board.cycleComponent(row.orderId, row.itemId, row.component.id)"
      >
        <span class="w-7 shrink-0 font-mono text-[12px] font-bold" :class="light ? 'text-ink' : 'text-paper'">{{ row.table }}</span>
        <span class="w-16 shrink-0 font-mono text-[11px] tabular-nums" :class="light ? 'text-steel-500' : 'text-paper/50'">#{{ row.orderId.slice(-6) }}</span>
        <span class="w-40 shrink-0 truncate text-[13px]" :class="light ? 'text-muted' : 'text-paper/60'">{{ row.itemName }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[14px] font-medium" :class="[light ? 'text-ink' : 'text-paper', row.bucket === 'done' ? 'line-through' : '']">
            {{ row.component.name }}
          </span>
          <!-- The station's itemized work for this dish, on one dense line -->
          <span
            v-if="row.component.tasks.length && row.bucket !== 'done'"
            class="block truncate font-mono text-[11px] leading-tight"
            :class="light ? 'text-steel-600' : 'text-paper/50'"
          >
            {{ row.component.tasks.join(' · ') }}
          </span>
        </span>

        <span class="shrink-0 font-mono text-[11px] tabular-nums" :class="row.bucket === 'critical' || row.bucket === 'urgent' ? 'text-alert' : light ? 'text-steel-500' : 'text-paper/45'">
          {{ row.elapsed }} min
        </span>

        <!-- state / severity glyph -->
        <span class="grid w-16 shrink-0 place-items-center">
          <span v-if="row.bucket === 'critical'" class="pill pill-alert animate-pulse">crítico</span>
          <span v-else-if="row.bucket === 'urgent'" class="pill pill-alert">urgente</span>
          <span v-else-if="row.bucket === 'warn'" class="pill pill-warn">espera</span>
          <span v-else-if="row.bucket === 'cooking'" class="h-2.5 w-2.5 animate-pulse rounded-full bg-ember" />
          <span v-else-if="row.bucket === 'pending'" class="h-2.5 w-2.5 rounded-full ring-1" :class="light ? 'ring-steel-400' : 'ring-white/30'" />
          <span v-else class="text-success">✓</span>
        </span>
      </li>
    </ul>
  </div>
</template>
