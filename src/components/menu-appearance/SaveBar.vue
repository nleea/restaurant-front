<script setup lang="ts">
// Sticky action bar on the graphite rail: an ember dot flags unsaved changes, Publish PUTs the draft
// to the appearance API (store adopts the echoed copy as published), Discard reverts.
import { ref } from 'vue'
import { useMenuAppearanceStore } from '@/stores/menuAppearance'

const store = useMenuAppearanceStore()
const publishing = ref(false)
const error = ref(false)

async function publish() {
  if (!store.isDirty || publishing.value) return
  publishing.value = true
  error.value = false
  try {
    await store.publish()
  } catch {
    error.value = true
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-4 bg-graphite-900 px-4 py-2.5">
    <div class="flex min-w-0 items-center gap-2.5">
      <span
        class="size-2 shrink-0 rounded-full"
        :class="store.isDirty ? 'bg-ember shadow-[0_0_10px_rgba(242,147,59,0.8)]' : 'bg-steel-600'"
        aria-hidden="true"
      />
      <span
        class="truncate font-mono text-[11px] uppercase tracking-[0.14em]"
        :class="error ? 'text-alert' : 'text-paper/70'"
      >
        {{ error ? 'No se pudo guardar · reintenta' : store.isDirty ? 'Cambios sin guardar' : 'Todo guardado' }}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        :disabled="!store.isDirty || publishing"
        class="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-paper/60 transition enabled:hover:text-paper disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @click="store.discard()"
      >
        Descartar
      </button>
      <button
        type="button"
        :disabled="!store.isDirty || publishing"
        class="rounded-lg bg-ember px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-graphite-900 transition enabled:hover:bg-ember-600 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/60"
        @click="publish"
      >
        <i v-if="publishing" class="pi pi-spin pi-spinner text-[11px]" />
        {{ publishing ? 'Publicando…' : 'Guardar cambios' }}
      </button>
    </div>
  </div>
</template>
