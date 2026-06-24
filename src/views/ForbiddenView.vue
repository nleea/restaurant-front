<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from 'primevue/button'

const router = useRouter()
</script>

<template>
  <main class="min-h-screen flex items-center justify-center bg-app p-4">
    <div class="flex flex-col items-center gap-4 text-center">
      <p class="font-mono text-6xl font-medium text-ember">403</p>
      <h1 class="text-xl font-extrabold text-ink">No tienes permiso para ver esto</h1>
      <p class="text-steel-500">Tu cuenta no incluye el permiso requerido para esta sección.</p>
      <Button label="Volver" severity="secondary" outlined @click="router.replace('/')" />
    </div>
  </main>
</template>
