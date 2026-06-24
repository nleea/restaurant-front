<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useAuthStore } from '@/stores/auth'
import { useRbacStore } from '@/stores/rbac'
import type { PermissionEffect, UserAccess, UserSummary } from '@/services/rbac.api'

const auth = useAuthStore()
const rbac = useRbacStore()
const canManage = computed(() => auth.can('rbac.manage'))

const selected = ref<UserSummary | null>(null)
const access = ref<UserAccess | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const showEffective = ref(false)

const newOverrideCode = ref<string | null>(null)
const newOverrideEffect = ref<PermissionEffect>('allow')

const permissionOptions = computed(() =>
  rbac.permissions.map((p) => ({ label: p.code, value: p.code })),
)
const effectOptions = [
  { label: 'Permitir', value: 'allow' },
  { label: 'Denegar', value: 'deny' },
]

const assignedRoleIds = computed(() => new Set(access.value?.roles.map((r) => r.id) ?? []))

onMounted(async () => {
  await Promise.all([
    rbac.fetchUsers(),
    rbac.roles.length ? null : rbac.fetchRoles(),
    rbac.permissions.length ? null : rbac.fetchCatalog(),
  ])
})

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

async function refreshAccess() {
  if (!selected.value) return
  access.value = await rbac.getUserAccess(selected.value.id)
}

async function selectUser(user: UserSummary) {
  selected.value = user
  error.value = null
  showEffective.value = false
  loading.value = true
  try {
    await refreshAccess()
  } catch {
    error.value = 'No se pudo cargar el acceso del usuario.'
  } finally {
    loading.value = false
  }
}

async function guard(action: () => Promise<void>, message: string) {
  if (!selected.value || !canManage.value) return
  try {
    await action()
    await refreshAccess()
  } catch {
    error.value = message
  }
}

function toggleRole(roleId: string, assign: boolean) {
  const userId = selected.value!.id
  void guard(
    () => (assign ? rbac.assignRole(userId, roleId) : rbac.revokeRole(userId, roleId)),
    'No se pudo actualizar el rol.',
  )
}

function addOverride() {
  if (!newOverrideCode.value) return
  const code = newOverrideCode.value
  const effect = newOverrideEffect.value
  const userId = selected.value!.id
  void guard(() => rbac.setOverride(userId, code, effect), 'No se pudo crear el override.').then(
    () => {
      newOverrideCode.value = null
    },
  )
}

function removeOverride(code: string) {
  const userId = selected.value!.id
  void guard(() => rbac.removeOverride(userId, code), 'No se pudo quitar el override.')
}
</script>

<template>
  <div class="lg:grid lg:grid-cols-[22rem_1fr] lg:gap-6">
    <!-- LIST (drill-down master) -->
    <aside class="flex flex-col gap-3" :class="selected ? 'max-lg:hidden' : ''">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Usuarios</h2>
      <ul class="flex flex-col gap-1.5">
        <li v-for="user in rbac.users" :key="user.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="selected?.id === user.id ? 'border-ember ring-1 ring-ember/30' : ''"
            @click="selectUser(user)"
          >
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2">
                <span class="truncate text-sm font-medium text-ink">{{ user.name }}</span>
                <span v-if="!user.is_active" class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-alert">inactivo</span>
              </span>
              <span class="block truncate font-mono text-[11px] text-steel-500">{{ user.email }}</span>
              <span class="block font-mono text-[10px] text-steel-500/80">último acceso · {{ fmtDate(user.last_login_at) }}</span>
            </span>
            <span class="shrink-0 text-steel-500 lg:hidden" aria-hidden="true">
              <i class="pi pi-angle-right" />
            </span>
          </button>
        </li>
      </ul>
    </aside>

    <!-- DETAIL -->
    <section class="rounded-xl border border-line bg-paper" :class="selected ? '' : 'max-lg:hidden'">
      <div v-if="!selected" class="grid h-48 place-items-center px-6 text-center text-steel-500">
        Elige un usuario para gestionar su acceso.
      </div>

      <Transition name="detail">
        <div v-if="selected" :key="selected.id" class="p-5">
          <button
            type="button"
            class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
            @click="selected = null"
          >
            <i class="pi pi-angle-left" /> Usuarios
          </button>

          <p v-if="error" role="alert" class="mb-4 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
            {{ error }}
          </p>

          <div v-if="loading" class="text-steel-500">Cargando acceso…</div>

          <template v-else-if="access">
            <header class="mb-5">
              <h3 class="text-lg font-extrabold text-ink">{{ selected.name }}</h3>
              <p class="font-mono text-[11px] text-steel-500">{{ selected.email }}</p>
            </header>

            <!-- Roles -->
            <section class="mb-6">
              <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ember">Roles</h4>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="role in rbac.roles"
                  :key="role.id"
                  class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition"
                  :class="[
                    assignedRoleIds.has(role.id) ? 'border-ember/60 bg-ember/5' : 'border-line',
                    canManage ? 'cursor-pointer' : 'cursor-default',
                  ]"
                >
                  <input
                    type="checkbox"
                    class="size-4 accent-ember"
                    :checked="assignedRoleIds.has(role.id)"
                    :disabled="!canManage"
                    @change="toggleRole(role.id, ($event.target as HTMLInputElement).checked)"
                  />
                  <span class="text-ink">{{ role.name }}</span>
                </label>
              </div>
            </section>

            <!-- Overrides -->
            <section class="mb-6">
              <h4 class="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ember">Overrides</h4>
              <ul v-if="access.overrides.length" class="mb-3 flex flex-col gap-1.5">
                <li
                  v-for="o in access.overrides"
                  :key="o.permission_id"
                  class="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                >
                  <span class="truncate font-mono text-xs text-ink">{{ rbac.codeForPermissionId(o.permission_id) ?? o.permission_id }}</span>
                  <span class="flex shrink-0 items-center gap-2">
                    <span
                      class="rounded px-2 py-0.5 font-mono text-[10px] uppercase"
                      :class="o.effect === 'allow' ? 'bg-ember/15 text-ember-600' : 'bg-alert/10 text-alert'"
                      >{{ o.effect === 'allow' ? 'permitir' : 'denegar' }}</span
                    >
                    <Button
                      v-if="canManage"
                      icon="pi pi-times"
                      size="small"
                      severity="secondary"
                      text
                      rounded
                      aria-label="Quitar override"
                      @click="removeOverride(rbac.codeForPermissionId(o.permission_id) ?? '')"
                    />
                  </span>
                </li>
              </ul>
              <p v-else class="mb-3 text-sm text-steel-500">Sin overrides — el acceso viene solo de los roles.</p>

              <div v-if="canManage" class="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Select
                  v-model="newOverrideCode"
                  :options="permissionOptions"
                  option-label="label"
                  option-value="value"
                  filter
                  placeholder="Permiso…"
                  class="w-full sm:min-w-56 sm:flex-1"
                />
                <Select
                  v-model="newOverrideEffect"
                  :options="effectOptions"
                  option-label="label"
                  option-value="value"
                  class="w-full sm:w-36"
                />
                <Button label="Añadir" icon="pi pi-plus" :disabled="!newOverrideCode" class="shrink-0" @click="addOverride" />
              </div>
            </section>

            <!-- Effective permissions (collapsed by default so controls stay reachable on mobile) -->
            <section>
              <button
                type="button"
                class="flex w-full items-center justify-between border-t border-line pt-3 text-left"
                :aria-expanded="showEffective"
                @click="showEffective = !showEffective"
              >
                <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
                  Permisos efectivos · {{ access.effective_permissions.length }}
                </span>
                <i class="pi text-steel-500" :class="showEffective ? 'pi-angle-up' : 'pi-angle-down'" />
              </button>
              <ul v-if="showEffective" class="mt-3 flex flex-wrap gap-1.5">
                <li
                  v-for="code in access.effective_permissions"
                  :key="code"
                  class="rounded bg-app px-2 py-1 font-mono text-[11px] text-ink"
                >
                  {{ code }}
                </li>
              </ul>
            </section>
          </template>
        </div>
      </Transition>
    </section>
  </div>
</template>
