<script setup lang="ts">
// Shown when the customer lands on /store with no branch code and the tenant runs more than one
// branch — and as the recovery affordance when a code resolves to nothing. Selecting a branch
// navigates to /store/<code>, which is the canonical link from then on.
//
// Deliberately NOT shown for single-branch tenants: asking "which one?" when there is one is a
// question with no information in it.
import type { StorefrontBranch } from '@/services/storefront.api'

defineProps<{
  branches: StorefrontBranch[]
  /** Set when we got here because a code in the URL matched nothing. */
  notFound?: boolean
  brandName?: string
}>()

const emit = defineEmits<{ (e: 'select', code: string): void }>()
</script>

<template>
  <section class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-5 py-10">
    <header class="space-y-2 text-center">
      <p v-if="brandName" class="text-sm opacity-70">{{ brandName }}</p>
      <h1 class="text-2xl font-semibold">
        {{ notFound ? 'No encontramos esa sede' : '¿De cuál sede quieres pedir?' }}
      </h1>
      <p class="text-sm opacity-70">
        {{
          notFound
            ? 'El enlace apunta a una sede que no existe o está cerrada. Elige una de estas:'
            : 'Cada sede tiene su propia carta y sus horarios.'
        }}
      </p>
    </header>

    <ul class="flex flex-col gap-3">
      <li v-for="branch in branches" :key="branch.id">
        <button
          type="button"
          class="w-full rounded-xl border px-4 py-3 text-left transition hover:opacity-80"
          :data-branch-code="branch.code"
          @click="emit('select', branch.code)"
        >
          <span class="block font-medium">{{ branch.name }}</span>
          <span v-if="branch.address" class="block text-sm opacity-70">{{ branch.address }}</span>
        </button>
      </li>
    </ul>

    <p v-if="branches.length === 0" class="text-center text-sm opacity-70">
      No hay sedes disponibles en este momento.
    </p>
  </section>
</template>
