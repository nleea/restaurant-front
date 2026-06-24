<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useAuthStore } from '@/stores/auth'
import { useRbacStore } from '@/stores/rbac'
import { stationLabel } from '@/lib/stations'
import type { Permission, Role } from '@/services/rbac.api'

const auth = useAuthStore()
const rbac = useRbacStore()
const canManage = computed(() => auth.can('rbac.manage'))

const selected = ref<Role | null>(null)
const roleCodes = ref<Set<string>>(new Set())
const expanded = ref<Set<string>>(new Set())
const loadingPerms = ref(false)
const error = ref<string | null>(null)

const showCreate = ref(false)
const newName = ref('')
const newDescription = ref('')
const creating = ref(false)

onMounted(async () => {
  await Promise.all([rbac.fetchRoles(), rbac.permissions.length ? null : rbac.fetchCatalog()])
})

function grantedIn(perms: Permission[]): number {
  return perms.filter((p) => roleCodes.value.has(p.code)).length
}

async function selectRole(role: Role) {
  selected.value = role
  error.value = null
  expanded.value = new Set()
  loadingPerms.value = true
  try {
    roleCodes.value = new Set(await rbac.getRolePermissions(role.id))
  } catch {
    error.value = 'No se pudieron cargar los permisos del rol.'
  } finally {
    loadingPerms.value = false
  }
}

function toggleStation(module: string) {
  const next = new Set(expanded.value)
  if (next.has(module)) next.delete(module)
  else next.add(module)
  expanded.value = next
}

const editable = computed(
  () => canManage.value && selected.value !== null && !selected.value.is_global,
)

async function togglePermission(code: string, enabled: boolean) {
  if (!selected.value || !editable.value) return
  const next = new Set(roleCodes.value)
  if (enabled) next.add(code)
  else next.delete(code)
  roleCodes.value = next
  try {
    await rbac.toggleRolePermission(selected.value.id, code, enabled)
  } catch {
    const reverted = new Set(roleCodes.value)
    if (enabled) reverted.delete(code)
    else reverted.add(code)
    roleCodes.value = reverted
    error.value = `No se pudo actualizar ${code}.`
  }
}

async function submitCreate() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    const role = await rbac.createRole(newName.value.trim(), newDescription.value.trim() || null)
    showCreate.value = false
    newName.value = ''
    newDescription.value = ''
    await selectRole(role)
  } catch {
    error.value = 'No se pudo crear el rol.'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="lg:grid lg:grid-cols-[19rem_1fr] lg:gap-6">
    <!-- LIST (drill-down master) -->
    <aside class="flex flex-col gap-3" :class="selected ? 'max-lg:hidden' : ''">
      <div class="flex items-center justify-between">
        <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">Roles</h2>
        <Button v-if="canManage" label="Nuevo" size="small" icon="pi pi-plus" @click="showCreate = true" />
      </div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="role in rbac.roles" :key="role.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3.5 py-3 text-left transition hover:border-ember/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/30"
            :class="selected?.id === role.id ? 'border-ember ring-1 ring-ember/30' : ''"
            @click="selectRole(role)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-ink">{{ role.name }}</span>
              <span v-if="role.is_global" class="font-mono text-[10px] uppercase tracking-wide text-steel-500">rol global</span>
            </span>
            <span class="shrink-0 text-steel-500 lg:hidden" aria-hidden="true">
              <i class="pi pi-angle-right" />
            </span>
          </button>
        </li>
      </ul>
    </aside>

    <!-- DETAIL -->
    <section
      class="rounded-xl border border-line bg-paper"
      :class="selected ? 'max-lg:mt-0' : 'max-lg:hidden'"
    >
      <div v-if="!selected" class="grid h-48 place-items-center px-6 text-center text-steel-500">
        Elige un rol para ver qué estaciones cubre.
      </div>

      <Transition name="detail">
        <div v-if="selected" :key="selected.id" class="p-5">
          <!-- Back (mobile only) -->
          <button
            type="button"
            class="mb-3 flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.16em] text-steel-500 lg:hidden"
            @click="selected = null"
          >
            <i class="pi pi-angle-left" /> Roles
          </button>

          <header class="mb-4">
            <h3 class="text-lg font-extrabold text-ink">{{ selected.name }}</h3>
            <p v-if="selected.description" class="text-sm text-steel-500">{{ selected.description }}</p>
            <p v-if="selected.is_global" class="mt-1 font-mono text-[11px] uppercase tracking-wide text-steel-500">
              Rol global — solo lectura
            </p>
          </header>

          <p v-if="error" role="alert" class="mb-4 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert">
            {{ error }}
          </p>

          <div v-if="loadingPerms" class="text-steel-500">Cargando permisos…</div>

          <!-- Station accordions -->
          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(perms, module) in rbac.permissionsByModule"
              :key="module"
              class="overflow-hidden rounded-lg border border-line"
            >
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-app focus-visible:outline-none focus-visible:bg-app"
                :aria-expanded="expanded.has(module)"
                @click="toggleStation(module)"
              >
                <i
                  class="pi shrink-0 text-steel-500 transition-transform"
                  :class="expanded.has(module) ? 'pi-angle-down' : 'pi-angle-right'"
                />
                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline justify-between gap-2">
                    <span class="font-mono text-[12px] uppercase tracking-[0.14em] text-ember">{{ stationLabel(module) }}</span>
                    <span class="shrink-0 font-mono text-[11px] text-steel-500">{{ grantedIn(perms) }}/{{ perms.length }}</span>
                  </span>
                  <!-- Fill bar: how much of this station the role covers -->
                  <span class="mt-1.5 block h-1 w-full rounded-full bg-app">
                    <span
                      class="block h-1 rounded-full bg-ember transition-all"
                      :style="{ width: `${(grantedIn(perms) / perms.length) * 100}%` }"
                    />
                  </span>
                </span>
              </button>

              <div v-if="expanded.has(module)" class="border-t border-line px-3.5 py-3">
                <div class="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  <label
                    v-for="p in perms"
                    :key="p.code"
                    class="flex items-start gap-2.5 text-sm"
                    :class="editable ? 'cursor-pointer' : 'cursor-default opacity-80'"
                  >
                    <input
                      type="checkbox"
                      class="mt-0.5 size-4 accent-ember"
                      :checked="roleCodes.has(p.code)"
                      :disabled="!editable"
                      @change="togglePermission(p.code, ($event.target as HTMLInputElement).checked)"
                    />
                    <span>
                      <span class="text-ink">{{ p.name }}</span>
                      <span class="block font-mono text-[11px] text-steel-500">{{ p.code }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </section>

    <!-- Create role dialog -->
    <Dialog v-model:visible="showCreate" modal header="Nuevo rol" :style="{ width: '24rem' }" :breakpoints="{ '480px': '92vw' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1.5">
          <label for="role-name" class="text-xs font-medium uppercase tracking-wide text-steel-500">Nombre</label>
          <InputText id="role-name" v-model="newName" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="role-desc" class="text-xs font-medium uppercase tracking-wide text-steel-500">Descripción</label>
          <InputText id="role-desc" v-model="newDescription" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="showCreate = false" />
        <Button label="Crear" :loading="creating" :disabled="!newName.trim()" @click="submitCreate" />
      </template>
    </Dialog>
  </div>
</template>
