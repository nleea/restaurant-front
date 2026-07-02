<script setup lang="ts">
import { computed } from 'vue'
import { useBranchStore } from '@/stores/branch'

// Active-branch affordance for the app shell. Renders nothing until branches load; a static
// label for single-branch tenants; a switcher when the tenant has more than one branch.
// `variant` adapts to the dark pass-rail (sidebar) vs. the light mobile top bar.
const props = withDefaults(defineProps<{ variant?: 'dark' | 'light' }>(), {
  variant: 'dark',
})

const branch = useBranchStore()

const dark = computed(() => props.variant === 'dark')

function onChange(event: Event) {
  branch.setActiveBranch((event.target as HTMLSelectElement).value)
}
</script>

<template>
  <div v-if="branch.hasActiveBranch" class="flex items-center gap-2">
    <i
      class="pi pi-map-marker text-[13px]"
      :class="dark ? 'text-ember' : 'text-ember'"
      aria-hidden="true"
    />

    <!-- Multi-branch: a switcher. Single-branch: a static label (no implied choice). -->
    <select
      v-if="branch.hasMultipleBranches"
      :value="branch.activeBranchId"
      aria-label="Sucursal activa"
      class="min-w-0 flex-1 cursor-pointer truncate rounded-md border bg-transparent py-1.5 pl-2 pr-7 font-mono text-[11px] uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :class="
        dark
          ? 'border-white/10 text-paper/85 hover:border-white/20 [&>option]:text-ink'
          : 'border-line text-ink hover:border-ember/50'
      "
      @change="onChange"
    >
      <option v-for="b in branch.branches" :key="b.id" :value="b.id">
        {{ b.name }}
      </option>
    </select>

    <span
      v-else
      class="truncate font-mono text-[11px] uppercase tracking-[0.12em]"
      :class="dark ? 'text-paper/70' : 'text-ink'"
      :title="branch.activeBranch?.name"
    >
      {{ branch.activeBranch?.name }}
    </span>
  </div>
</template>
