<script setup lang="ts">
// One dialog, three shapes — entrada (in), retiro (out), gasto (expense). The
// accent follows the money direction: entrada = success, retiro/gasto = alert
// with an ember note for the operative "gasto". No new colors; the direction is
// the signal.
import { computed, ref } from 'vue'
import StationModal from './StationModal.vue'
import MoneyField from './MoneyField.vue'
import { registerEntry, registerWithdrawal, registerExpense, employeeOptions, type PayMethod } from '@/lib/cashStation'
import { statusOf } from '@/lib/apiError'

const props = defineProps<{ kind: 'entry' | 'withdrawal' | 'expense' }>()
const emit = defineEmits<{ close: []; done: [string] }>()

const CONFIG = {
  entry: {
    eyebrow: 'Movimiento · Entrada',
    title: 'Registrar entrada de efectivo',
    concepts: ['Venta en efectivo', 'Fondo adicional', 'Cambio de billete', 'Otro'],
    conceptLabel: 'Concepto',
    cta: 'Registrar entrada',
    tone: 'success' as const,
  },
  withdrawal: {
    eyebrow: 'Movimiento · Retiro',
    title: 'Registrar retiro de caja',
    concepts: ['Pago a proveedor', 'Gastos operativos', 'Envío a banco', 'Préstamo interno', 'Otro'],
    conceptLabel: 'Motivo',
    cta: 'Registrar retiro',
    tone: 'alert' as const,
  },
  expense: {
    eyebrow: 'Movimiento · Gasto',
    title: 'Registrar gasto',
    concepts: ['Insumos', 'Servicios', 'Mantenimiento', 'Transporte', 'Otro'],
    conceptLabel: 'Categoría',
    cta: 'Registrar gasto',
    tone: 'ember' as const,
  },
}
const cfg = computed(() => CONFIG[props.kind])

const concept = ref<string>(cfg.value.concepts[0] ?? 'Otro')
const amount = ref<number | null>(null)
const note = ref('')
const auth = ref<string | null>(employeeOptions.value[0]?.value ?? null)
const method = ref<PayMethod>('cash')
const saving = ref(false)
const error = ref<string | null>(null)

const valid = computed(
  () =>
    amount.value != null &&
    amount.value > 0 &&
    concept.value.trim() !== '' &&
    (props.kind !== 'withdrawal' || auth.value !== null),
)

const ctaClasses = computed(
  () =>
    ({
      success: 'bg-success text-white hover:bg-success-600',
      alert: 'bg-alert text-white hover:bg-alert-600',
      ember: 'bg-ember text-white hover:bg-ember-600',
    })[cfg.value.tone],
)

async function submit() {
  if (!valid.value || amount.value == null || saving.value) return
  saving.value = true
  error.value = null
  try {
    if (props.kind === 'entry') await registerEntry(amount.value, concept.value, note.value)
    else if (props.kind === 'withdrawal')
      await registerWithdrawal(amount.value, concept.value, auth.value ?? '')
    else await registerExpense(amount.value, concept.value, note.value, method.value)
    emit(
      'done',
      cfg.value.cta === 'Registrar entrada'
        ? 'Entrada registrada'
        : cfg.value.cta === 'Registrar retiro'
          ? 'Retiro registrado'
          : 'Gasto registrado',
    )
  } catch (e) {
    const status = statusOf(e)
    error.value =
      status === 409
        ? 'La caja ya no está abierta.'
        : status === 422
          ? 'Datos inválidos: revisa el monto (debe ser mayor a cero).'
          : 'No se pudo registrar el movimiento.'
  } finally {
    saving.value = false
  }
}

const fieldLabel = 'mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500'
const control =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-ember/60 focus:ring-2 focus:ring-ember/20'
</script>

<template>
  <StationModal :eyebrow="cfg.eyebrow" :title="cfg.title" @close="emit('close')">
    <div class="flex flex-col gap-4">
      <div>
        <label :class="fieldLabel">{{ cfg.conceptLabel }}</label>
        <select v-model="concept" :class="control">
          <option v-for="c in cfg.concepts" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <div>
        <label :class="fieldLabel">Monto</label>
        <MoneyField v-model="amount" big />
      </div>

      <div v-if="kind === 'expense'">
        <label :class="fieldLabel">Método de pago</label>
        <div class="flex gap-2">
          <button
            v-for="m in (['cash', 'transfer', 'card'] as PayMethod[])"
            :key="m"
            type="button"
            class="flex-1 rounded-xl border px-3 py-2 font-mono text-[12px] transition"
            :class="method === m ? 'border-ember/60 bg-ember-50 text-ember-600' : 'border-line bg-surface text-steel-500 hover:bg-sunken'"
            @click="method = m"
          >
            {{ m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Tarjeta' }}
          </button>
        </div>
      </div>

      <div v-if="kind === 'withdrawal'">
        <label :class="fieldLabel">Autorizado por</label>
        <select v-model="auth" :class="control">
          <option :value="null" disabled>Elige un empleado</option>
          <option v-for="o in employeeOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </div>

      <div v-if="kind !== 'withdrawal'">
        <label :class="fieldLabel">Descripción <span class="text-steel-400">(opcional)</span></label>
        <input v-model="note" type="text" :class="control" placeholder="Detalle del movimiento…" />
      </div>

      <p
        v-if="kind === 'withdrawal'"
        class="flex items-center gap-2 rounded-lg border border-alert/25 bg-alert/5 px-3 py-2 font-mono text-[11px] text-alert-600"
      >
        <i class="pi pi-exclamation-triangle text-[11px]" />
        Este retiro quedará registrado en el arqueo del turno.
      </p>

      <p
        v-if="error"
        role="alert"
        class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-[11px] text-alert-600"
      >
        {{ error }}
      </p>

      <div class="mt-1 flex items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-xl px-4 py-2.5 text-sm font-medium text-steel-600 transition hover:bg-sunken"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          type="button"
          :disabled="!valid || saving"
          class="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
          :class="ctaClasses"
          @click="submit"
        >
          <i v-if="saving" class="pi pi-spin pi-spinner text-xs" />{{ cfg.cta }}
        </button>
      </div>
    </div>
  </StationModal>
</template>
