<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// "El riel del pase": the authenticated nav echoes the login's dark pass (bg-pass) while the
// content stays the light working surface. lg+ shows it as a fixed left rail; below lg it slides
// in as an off-canvas drawer, triggered from the mobile top bar in AppShell.
defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

interface NavLink {
  to: string
  label: string
  icon: string
  permission: string
}

const allLinks: NavLink[] = [
  { to: '/menu', label: 'Carta', icon: 'pi-book', permission: 'menu.read' },
  { to: '/catalog', label: 'Catálogo', icon: 'pi-database', permission: 'catalog.read' },
  { to: '/rbac', label: 'Accesos', icon: 'pi-shield', permission: 'rbac.manage' },
]

const links = computed(() => allLinks.filter((l) => auth.can(l.permission)))

function isActive(to: string): boolean {
  return route.path === to
}

function onLogout() {
  auth.logout()
  router.replace({ name: 'login' })
}
</script>

<template>
  <!-- Backdrop: mobile only, while the drawer is open. -->
  <Transition
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-200"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-40 bg-graphite-900/60 lg:hidden"
      aria-hidden="true"
      @click="emit('close')"
    />
  </Transition>

  <aside
    class="bg-pass fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-white/5 px-3 py-5 transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none lg:z-30 lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
  >
    <!-- Brand: the heat lamp over the pass -->
    <div class="flex items-center justify-between gap-2 px-2">
      <RouterLink :to="links[0]?.to ?? '/'" class="flex items-center gap-2.5" @click="emit('close')">
        <span class="grid size-7 place-items-center rounded-md bg-ember/15 text-ember shadow-[0_0_14px_rgba(242,147,59,0.45)]">
          <i class="pi pi-sun text-[15px]" />
        </span>
        <span class="font-display text-lg font-extrabold leading-none text-paper">El&nbsp;Pase</span>
      </RouterLink>
      <button
        type="button"
        class="-mr-1 grid size-8 place-items-center rounded-md text-paper/55 transition hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 lg:hidden"
        aria-label="Cerrar navegación"
        @click="emit('close')"
      >
        <i class="pi pi-times" />
      </button>
    </div>

    <!-- Nav -->
    <nav class="mt-7 flex flex-1 flex-col gap-1">
      <RouterLink
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :aria-current="isActive(link.to) ? 'page' : undefined"
        class="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        :class="
          isActive(link.to)
            ? 'bg-white/[0.06] text-paper'
            : 'text-paper/55 hover:bg-white/[0.04] hover:text-paper'
        "
        @click="emit('close')"
      >
        <!-- Signature: the heat-lamp ember bar marks the active station. -->
        <span
          v-if="isActive(link.to)"
          class="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-ember shadow-[0_0_12px_rgba(242,147,59,0.75)]"
          aria-hidden="true"
        />
        <i :class="['pi', link.icon, 'text-base']" />
        <span class="font-mono text-[12px] uppercase tracking-[0.14em]">{{ link.label }}</span>
      </RouterLink>
    </nav>

    <!-- Identity + exit -->
    <div class="flex flex-col gap-1 border-t border-white/5 pt-4">
      <p class="truncate px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-paper/40">
        {{ auth.user?.email }}
      </p>
      <button
        type="button"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-paper/55 transition hover:bg-white/[0.04] hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @click="onLogout"
      >
        <i class="pi pi-sign-out text-base" />
        <span class="font-mono text-[12px] uppercase tracking-[0.14em]">Salir</span>
      </button>
    </div>
  </aside>
</template>
