<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import EmployeesPanel from '@/components/staff/EmployeesPanel.vue'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · Personal
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Personal</h1>
          <p class="text-steel-500">Empleados y turnos de la sucursal activa.</p>
        </header>

        <EmployeesPanel />
      </div>
    </main>
  </AppShell>
</template>
