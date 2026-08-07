<script setup lang="ts">
// Simple product-name filter. Two-way bound to the storefront's search term.
defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="px-4">
    <div class="flex items-center gap-2 rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-2.5">
      <i class="pi pi-search text-sm text-[var(--sf-muted)]" />
      <input
        :value="modelValue"
        type="search"
        placeholder="Buscar un plato…"
        class="w-full bg-transparent text-[15px] text-[var(--sf-text)] outline-none placeholder:text-[var(--sf-muted)]"
        aria-label="Buscar un plato"
        @input="onInput"
      />
      <button v-if="modelValue" type="button" class="text-[var(--sf-muted)] transition hover:text-[var(--sf-text)]" aria-label="Limpiar búsqueda" @click="emit('update:modelValue', '')">
        <i class="pi pi-times text-xs" />
      </button>
    </div>
  </section>
</template>
