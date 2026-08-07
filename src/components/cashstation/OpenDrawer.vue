<script setup lang="ts">
// State A hero — the closed drawer. Cool graphite "pass" strip on top (the lamp
// is off); opening it lights the station. Fondo is the one figure that matters.
import { computed, ref } from 'vue'
import MoneyField from './MoneyField.vue'
import { openCaja, employeeOptions, longDate } from '@/lib/cashStation'
import { cop } from '@/lib/cop'
import { statusOf } from '@/lib/apiError'

const emit = defineEmits<{ opened: [] }>()

const employee = ref<string | null>(null)
const fondo = ref<number | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)
const valid = computed(() => !!employee.value && fondo.value != null && fondo.value >= 0)

const selectedName = computed(
  () => employeeOptions.value.find((o) => o.value === employee.value)?.label ?? '',
)
const initials = computed(() =>
  selectedName.value
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase(),
)

async function submit() {
  if (!valid.value || !employee.value || fondo.value == null || saving.value) return
  saving.value = true
  error.value = null
  try {
    await openCaja(employee.value, fondo.value)
    emit('opened')
  } catch (e) {
    error.value =
      statusOf(e) === 409 ? 'Ya hay una caja abierta en esta sucursal.' : 'No se pudo abrir la caja.'
  } finally {
    saving.value = false
  }
}

const fieldLabel = 'mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500'
</script>

<template>
  <div class="card animate-docket overflow-hidden">
    <!-- The pass: cool graphite field, lamp off. -->
    <div class="bg-pass px-6 py-5 sm:px-8">
      <div class="flex items-center gap-3">
        <span class="grid size-12 place-items-center rounded-xl bg-white/8 text-steel-300 ring-1 ring-white/10">
          <i class="pi pi-lock text-lg" />
        </span>
        <div>
          <h2 class="font-display text-lg font-semibold text-white">No hay una caja abierta</h2>
          <p class="font-mono text-[11px] text-steel-400">Sede Centro · Riohacha · {{ longDate(new Date().toISOString()) }}</p>
        </div>
      </div>
    </div>

    <div class="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
      <div>
        <label :class="fieldLabel">Empleado que abre</label>
        <div class="flex items-center rounded-xl border border-line bg-surface focus-within:border-ember/60 focus-within:ring-2 focus-within:ring-ember/20">
          <span
            v-if="employee"
            class="ml-2 grid size-7 shrink-0 place-items-center rounded-full bg-ember-100 font-mono text-[11px] font-bold text-ember-600"
          >
            {{ initials }}
          </span>
          <i v-else class="pi pi-user ml-3 text-steel-400" />
          <select
            v-model="employee"
            class="h-11 w-full bg-transparent px-3 text-sm text-ink outline-none"
            :class="!employee && 'text-steel-400'"
          >
            <option :value="null" disabled>Elige un empleado</option>
            <option v-for="o in employeeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </div>

      <div>
        <label :class="fieldLabel">Fondo de apertura</label>
        <MoneyField v-model="fondo" big placeholder="200.000" />
        <p class="mt-1.5 font-mono text-[11px] text-steel-400">Efectivo con el que abre la caja.</p>
      </div>

      <div class="sm:col-span-2">
        <p
          v-if="error"
          role="alert"
          class="mb-2.5 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-[11px] text-alert-600"
        >
          {{ error }}
        </p>
        <button
          type="button"
          :disabled="!valid || saving"
          class="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ember text-sm font-semibold text-white transition hover:bg-ember-600 disabled:cursor-not-allowed disabled:opacity-40"
          @click="submit"
        >
          <i :class="['pi text-sm', saving ? 'pi-spin pi-spinner' : 'pi-lock-open']" /> Abrir caja<span v-if="fondo" class="font-mono opacity-80">· {{ cop(fondo) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
