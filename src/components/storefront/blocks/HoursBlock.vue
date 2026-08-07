<script setup lang="ts">
// Opening hours block — the admin-entered schedule rows, themed with the tenant palette.
import type { HoursRow } from '@/lib/menuAppearance'

defineProps<{ rows: HoursRow[] }>()
</script>

<template>
  <section class="px-4">
    <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Horario</p>
    <div class="flex flex-col gap-1.5 rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-4">
      <div v-for="(r, i) in rows" :key="i" class="flex justify-between text-[14px]">
        <span class="text-[var(--sf-muted)]">{{ r.label }}</span>
        <span class="font-medium text-[var(--sf-text)]">{{ r.value }}</span>
      </div>
      <p v-if="!rows.length" class="text-[13px] text-[var(--sf-muted)]">Horario no definido.</p>
    </div>
  </section>
</template>
