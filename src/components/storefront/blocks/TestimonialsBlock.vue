<script setup lang="ts">
// Testimonials block — customer quotes the admin entered, themed with the tenant palette.
import type { Testimonial } from '@/lib/menuAppearance'

defineProps<{ items: Testimonial[] }>()
</script>

<template>
  <section class="px-4">
    <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--sf-muted)]">Testimonios</p>
    <div class="flex flex-col gap-2">
      <figure
        v-for="(t, i) in items"
        :key="i"
        class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-4"
      >
        <blockquote class="text-[14px] italic text-[var(--sf-text)]">“{{ t.quote }}”</blockquote>
        <figcaption class="mt-1.5 text-[12px] font-semibold text-[var(--sf-muted)]">— {{ t.author }}</figcaption>
      </figure>
    </div>
  </section>
</template>
