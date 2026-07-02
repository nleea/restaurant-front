<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BranchSelector from '@/components/BranchSelector.vue'
import { useBranchStore } from '@/stores/branch'

// App layout: fixed pass-rail sidebar on lg+, off-canvas drawer below lg. The content slot is
// padded left on lg to clear the fixed rail. Escape closes the mobile drawer.
const open = ref(false)
const branch = useBranchStore()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // Hydrate the active-branch context once for the whole authenticated shell. Swallow errors
  // so a transient branch-list failure never blocks rendering the app.
  void branch.ensureLoaded().catch(() => {})
})
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="min-h-screen bg-app">
    <!-- Mobile top bar: the only nav affordance below lg — a single trigger. -->
    <header
      class="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/85 px-4 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70 lg:hidden"
    >
      <button
        type="button"
        class="grid size-9 place-items-center rounded-md border border-line text-ink transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
        aria-label="Abrir navegación"
        @click="open = true"
      >
        <i class="pi pi-bars text-lg" />
      </button>
      <span class="flex items-center gap-2">
        <span class="grid size-6 place-items-center rounded bg-ember/15 text-ember">
          <i class="pi pi-sun text-[13px]" />
        </span>
        <span class="font-display text-base font-extrabold text-ink">El&nbsp;Pase</span>
      </span>

      <!-- Active branch, pushed to the trailing edge. -->
      <div class="ml-auto min-w-0">
        <BranchSelector variant="light" />
      </div>
    </header>

    <AppSidebar :open="open" @close="open = false" />

    <div class="lg:pl-60">
      <slot />
    </div>
  </div>
</template>
