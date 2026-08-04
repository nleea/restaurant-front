<script setup lang="ts">
// The driver's mobile frame: the dark "pass" header (identity + availability, echoing the login
// and the sidebar) over a light working body, with a thumb-zone bottom nav. Centered in a phone
// column so it also reads on desktop. Availability is derived from the run state.
import { computed } from 'vue'
import { useDriverStore, type DriverTab } from '@/stores/driver'

const driver = useDriverStore()

const availability = computed(() => {
  if (!driver.hasRun) return { label: 'Disponible', dot: 'bg-success', glow: false }
  if (driver.isComplete) return { label: 'Despacho completo', dot: 'bg-ember', glow: true }
  if (driver.run?.status === 'preparing')
    return { label: 'Preparando', dot: 'bg-steel-400', glow: false }
  return { label: 'En ruta', dot: 'bg-ember', glow: true }
})

const tabs: { id: DriverTab; label: string; icon: string }[] = [
  { id: 'home', label: 'Inicio', icon: 'pi-home' },
  { id: 'map', label: 'Mapa', icon: 'pi-map' },
  { id: 'day', label: 'Mi día', icon: 'pi-receipt' },
]
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-md flex-col bg-app">
    <!-- Dark pass header -->
    <header class="bg-pass sticky top-0 z-30 border-b border-white/5 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <!-- El nombre lo escribe RRHH y puede ser largo o venir sin espacios. Quien cede es el
           nombre (`min-w-0` + `truncate`), nunca la píldora de estado (`shrink-0`): saber si
           estás en ruta importa más que leer tu propio apellido entero. -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="grid size-8 flex-none place-items-center rounded-md bg-ember/15 text-ember shadow-[0_0_14px_rgba(242,147,59,0.45)]">
            <i class="pi pi-send text-[15px]" />
          </span>
          <div class="min-w-0 leading-tight">
            <p class="truncate font-display text-base font-extrabold text-paper">
              {{ driver.driverName }}
            </p>
            <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
              Domiciliario
            </p>
          </div>
        </div>
        <span
          class="flex flex-none items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-paper/80"
        >
          <span
            class="size-1.5 rounded-full"
            :class="[availability.dot, availability.glow ? 'shadow-[0_0_8px_rgba(242,147,59,0.9)]' : '']"
          />
          {{ availability.label }}
        </span>
      </div>
    </header>

    <!-- Working body -->
    <main class="flex-1 px-4 pb-28 pt-4">
      <slot />
    </main>

    <!-- Thumb-zone bottom nav -->
    <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur">
      <div class="mx-auto flex max-w-md pb-[env(safe-area-inset-bottom)]">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          class="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ember/40"
          :class="driver.tab === t.id ? 'text-ember-600' : 'text-steel-500 hover:text-ink'"
          :aria-current="driver.tab === t.id ? 'page' : undefined"
          @click="driver.setTab(t.id)"
        >
          <i :class="['pi', t.icon]" class="text-lg" />
          <span class="font-mono text-[10px] uppercase tracking-[0.12em]">{{ t.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>
