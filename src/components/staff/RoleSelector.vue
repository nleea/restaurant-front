<script setup lang="ts">
// The role block. A role is not a label, it is a set of keys to the house — so the badge is
// backed by the stations the role actually unlocks, read from `/rbac/roles/{id}/permissions`
// rather than from invented copy. Confirming a change shows the *diff*: which stations the
// employee gains and which they lose. That is the question a manager is really asking.
import { computed, ref, watch } from 'vue'
import { useStaffStore } from '@/stores/staff'
import type { RoleStation } from '@/stores/staff'

const props = defineProps<{
  roleId: string
  canManage: boolean
  saving?: boolean
  /** The employee is inactive: show the role, but don't offer to change it. */
  frozen?: boolean
}>()

const emit = defineEmits<{ change: [roleId: string] }>()

const staff = useStaffStore()

const currentName = computed(() => staff.roleName(props.roleId))
const currentStations = computed(() => staff.roleStations(props.roleId))

const open = ref(false)
/** The role picked from the list, held pending confirmation. */
const pending = ref<string | null>(null)

const otherRoles = computed(() => staff.roles.filter((r) => r.id !== props.roleId))
const pendingName = computed(() => (pending.value ? staff.roleName(pending.value) : ''))

// Load the current role's permissions, and the candidate's, so the diff can be rendered.
watch(() => props.roleId, (id) => void staff.loadRolePermissions(id), { immediate: true })
watch(pending, (id) => { if (id) void staff.loadRolePermissions(id) })
// A different employee closes any half-finished interaction.
watch(() => props.roleId, () => { open.value = false; pending.value = null })

const names = (stations: RoleStation[] | null) => new Set((stations ?? []).map((s) => s.label))

/** Stations the change adds and removes. Null when either side's permissions are unreadable. */
const diff = computed(() => {
  if (!pending.value) return null
  const from = currentStations.value
  const to = staff.roleStations(pending.value)
  if (!from || !to) return null
  const fromNames = names(from)
  const toNames = names(to)
  return {
    gains: to.filter((s) => !fromNames.has(s.label)).map((s) => s.label),
    losses: from.filter((s) => !toNames.has(s.label)).map((s) => s.label),
  }
})

function pick(roleId: string) {
  pending.value = roleId
  open.value = false
}

function confirm() {
  if (!pending.value) return
  emit('change', pending.value)
  pending.value = null
}
</script>

<template>
  <section class="rounded-xl border border-line bg-paper p-4">
    <h4 class="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500">Rol</h4>

    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <!-- Identity is typographic, not chromatic: the heat-lamp accent stays reserved for
             state (today, on shift, inactive) everywhere else in the app. -->
        <p class="font-mono text-lg font-bold uppercase leading-none tracking-[0.1em] text-ink">
          {{ currentName }}
        </p>

        <p v-if="currentStations === null" class="mt-2 font-mono text-[11px] text-steel-400">
          Permisos administrados en Accesos.
        </p>
        <p v-else-if="!currentStations.length" class="mt-2 font-mono text-[11px] text-steel-400">
          Este rol no abre ninguna estación todavía.
        </p>
        <p v-else class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-snug">
          <template v-for="(s, i) in currentStations" :key="s.module">
            <span v-if="i" class="text-steel-300" aria-hidden="true">·</span>
            <!-- Two levels, no colour: writes in ink, reads in steel. -->
            <span :class="s.manages ? 'font-medium text-ink' : 'text-steel-500'">{{ s.label }}</span>
          </template>
        </p>
        <p
          v-if="currentStations?.length"
          class="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-steel-400"
        >
          En negro, gestiona · en gris, solo consulta
        </p>
      </div>

      <!-- Hand-built dropdown -->
      <div v-if="canManage && !frozen" class="relative shrink-0">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
          :aria-expanded="open"
          aria-haspopup="listbox"
          @click="open = !open"
        >
          Cambiar
          <i class="pi text-[9px]" :class="open ? 'pi-angle-up' : 'pi-angle-down'" />
        </button>

        <div v-if="open" class="fixed inset-0 z-20" @click="open = false" />
        <Transition
          enter-active-class="transition duration-150 ease-out motion-reduce:transition-none"
          enter-from-class="opacity-0 -translate-y-1"
          leave-active-class="transition duration-100 ease-in motion-reduce:transition-none"
          leave-to-class="opacity-0"
        >
          <ul
            v-if="open"
            class="absolute right-0 z-30 mt-1.5 max-h-64 w-52 overflow-y-auto rounded-xl border border-line bg-paper p-1 shadow-xl shadow-graphite-900/10"
            role="listbox"
            @keydown.esc="open = false"
          >
            <li v-for="r in otherRoles" :key="r.id">
              <button
                type="button"
                role="option"
                :aria-selected="false"
                class="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-ember-50"
                @click="pick(r.id)"
              >
                <span class="block font-mono text-[11px] uppercase tracking-[0.1em] text-ink">
                  {{ r.name }}
                </span>
                <span v-if="r.description" class="block truncate text-[11px] text-steel-500">
                  {{ r.description }}
                </span>
              </button>
            </li>
            <li v-if="!otherRoles.length" class="px-2.5 py-2 font-mono text-[11px] text-steel-400">
              No hay otros roles.
            </li>
          </ul>
        </Transition>
      </div>
    </div>

    <!-- Confirmation: a permissions diff, because that is what actually changes. -->
    <Transition
      enter-active-class="transition duration-150 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div v-if="pending" class="mt-4 rounded-lg border border-ember/35 bg-ember-50/60 p-3.5">
        <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-ember-600">
          Confirmar cambio de rol
        </p>
        <p class="mt-1.5 font-mono text-sm text-ink">
          {{ currentName }} <span class="text-steel-400">→</span> {{ pendingName }}
        </p>

        <dl v-if="diff" class="mt-2.5 flex flex-col gap-1 text-[13px]">
          <div v-if="diff.gains.length" class="flex gap-2">
            <dt class="shrink-0 font-mono text-[11px] uppercase tracking-wide text-steel-500">
              Gana
            </dt>
            <dd class="text-ink">{{ diff.gains.join(' · ') }}</dd>
          </div>
          <div v-if="diff.losses.length" class="flex gap-2">
            <dt class="shrink-0 font-mono text-[11px] uppercase tracking-wide text-steel-500">
              Pierde
            </dt>
            <dd class="text-alert">{{ diff.losses.join(' · ') }}</dd>
          </div>
          <p v-if="!diff.gains.length && !diff.losses.length" class="text-steel-500">
            Abre las mismas estaciones.
          </p>
        </dl>
        <p v-else class="mt-2 text-[13px] text-steel-500">
          Esto cambia los permisos del empleado.
        </p>

        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ember-600 disabled:opacity-60"
            :disabled="saving"
            @click="confirm"
          >
            {{ saving ? 'Aplicando…' : 'Aplicar rol' }}
          </button>
          <button
            type="button"
            class="rounded-lg px-3 py-1.5 text-sm text-steel-500 transition hover:text-ink"
            @click="pending = null"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Transition>
  </section>
</template>
