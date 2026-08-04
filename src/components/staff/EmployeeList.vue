<script setup lang="ts">
// The roster. Presentational: the panel owns loading and selection, this owns the cards.
import { computed } from 'vue'
import Button from 'primevue/button'
import { useStaffStore } from '@/stores/staff'
import { initialsOf } from '@/lib/initials'
import type { Employee } from '@/services/staff.api'

const props = defineProps<{
  employees: Employee[]
  selectedId: string | null
  activeOnly: boolean
  canManage: boolean
  loading: boolean
  error: string | null
  hasActiveBranch: boolean
}>()

const emit = defineEmits<{
  select: [employee: Employee]
  create: []
  'update:activeOnly': [value: boolean]
}>()

const staff = useStaffStore()

// Active staff first, then alphabetical — the people on the roster today lead the list.
const ordered = computed(() =>
  [...props.employees].sort((a, b) =>
    a.is_active === b.is_active
      ? staff.employeeName(a).localeCompare(staff.employeeName(b))
      : a.is_active
        ? -1
        : 1,
  ),
)

const inactiveCount = computed(() => props.employees.filter((e) => !e.is_active).length)
</script>

<template>
  <aside class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
        Empleados
        <span v-if="ordered.length" class="text-steel-300">· {{ ordered.length }}</span>
      </h2>
      <Button
        v-if="canManage"
        label="Nuevo"
        size="small"
        icon="pi pi-plus"
        :disabled="!hasActiveBranch"
        @click="emit('create')"
      />
    </div>

    <!-- Same switch language as the detail header, one size down. -->
    <label class="flex cursor-pointer items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500">
      <button
        type="button"
        role="switch"
        :aria-checked="activeOnly"
        class="relative h-5 w-9 shrink-0 rounded-full transition"
        :class="activeOnly ? 'bg-ember' : 'bg-steel-300'"
        @click="emit('update:activeOnly', !activeOnly)"
      >
        <span
          class="absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all duration-150 motion-reduce:transition-none"
          :class="activeOnly ? 'left-[1.125rem]' : 'left-0.5'"
        />
      </button>
      Solo activos
      <span v-if="activeOnly && inactiveCount" class="text-steel-300 normal-case tracking-normal">
        ({{ inactiveCount }} oculto{{ inactiveCount > 1 ? 's' : '' }})
      </span>
    </label>

    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
    >
      {{ error }}
    </p>
    <p
      v-else-if="!hasActiveBranch"
      class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
    >
      Esta cuenta aún no tiene sucursales.
    </p>

    <p v-if="loading" class="font-mono text-[11px] text-steel-500">Cargando personal…</p>
    <p v-else-if="!ordered.length" class="text-sm text-steel-500">
      No hay empleados en esta sucursal.
    </p>

    <ul v-else class="flex flex-col gap-1.5">
      <li v-for="emp in ordered" :key="emp.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl border bg-paper px-3 py-2.5 text-left transition hover:border-ember/60"
          :class="[
            selectedId === emp.id ? 'border-ember ring-1 ring-ember/30' : 'border-line',
            // Inactive staff read as switched off, not merely tagged.
            emp.is_active ? '' : 'opacity-60 grayscale',
          ]"
          @click="emit('select', emp)"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold tracking-wide"
            :class="emp.is_active ? 'bg-ember-50 text-ember-600' : 'bg-sunken text-steel-400'"
            aria-hidden="true"
          >
            {{ initialsOf(staff.employeeName(emp)) }}
          </span>

          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm font-medium leading-snug"
              :class="emp.is_active ? 'text-ink' : 'text-steel-500'"
            >
              {{ staff.employeeName(emp) }}
            </span>
            <span class="block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-steel-500">
              {{ staff.roleName(emp.role_id) }}
              <span class="text-steel-300">·</span>
              {{ staff.branchName(emp.branch_id) }}
            </span>
          </span>

          <span class="flex shrink-0 items-center gap-2">
            <span
              v-if="!emp.is_active"
              class="rounded-full bg-steel-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-steel-500"
            >
              Inactivo
            </span>
            <span class="text-steel-300 lg:hidden" aria-hidden="true">
              <i class="pi pi-angle-right text-xs" />
            </span>
          </span>
        </button>
      </li>
    </ul>
  </aside>
</template>
