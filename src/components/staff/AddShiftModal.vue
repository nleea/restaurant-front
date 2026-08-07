<script setup lang="ts">
// "Agregar turno" — a PrimeVue Dialog (same shell as "Nuevo empleado") wrapping a hand-built
// form. The preview rail is the calendar's own language shown live: as the hours are typed,
// the bar slides across the 24 h track, so the shift's place in the day is visible before it
// is saved.
import { computed, ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { durationHours, formatHours, fromISODate, railSegment } from '@/lib/calendar'
import { isValidShiftRange } from '@/stores/staff'

const props = defineProps<{
  visible: boolean
  /** "YYYY-MM-DD" the calendar was clicked on; pre-fills the date field. */
  date: string
  employeeName: string
  saving?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  submit: [value: { shift_date: string; start_time: string; end_time: string }]
}>()

const fDate = ref(props.date)
const fStart = ref('')
const fEnd = ref('')

// Re-seed on every open so a stale draft never leaks into the next day the user clicks.
watch(
  () => [props.visible, props.date] as const,
  ([open, date]) => {
    if (!open) return
    fDate.value = date
    fStart.value = ''
    fEnd.value = ''
  },
)

const rangeValid = computed(
  () => fStart.value !== '' && fEnd.value !== '' && isValidShiftRange(fStart.value, fEnd.value),
)
const canSubmit = computed(() => fDate.value !== '' && rangeValid.value)

const preview = computed(() =>
  rangeValid.value ? railSegment(fStart.value, fEnd.value) : null,
)
const hours = computed(() =>
  rangeValid.value ? formatHours(durationHours(fStart.value, fEnd.value)) : null,
)
const longDate = computed(() =>
  fDate.value
    ? fromISODate(fDate.value).toLocaleDateString('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '—',
)

function submit() {
  if (!canSubmit.value) return
  emit('submit', {
    shift_date: fDate.value,
    start_time: fStart.value,
    end_time: fEnd.value,
  })
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Agregar turno"
    :style="{ width: '26rem' }"
    :breakpoints="{ '480px': '92vw' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-4 pt-1">
      <p class="font-mono text-[11px] text-steel-500">
        <span class="text-ink">{{ employeeName }}</span> ·
        <span class="capitalize">{{ longDate }}</span>
      </p>

      <div class="grid grid-cols-3 gap-2">
        <div class="flex flex-col gap-1.5">
          <label for="sh-date" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
            Fecha
          </label>
          <InputText id="sh-date" v-model="fDate" type="date" fluid />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="sh-start" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
            Inicio
          </label>
          <InputText id="sh-start" v-model="fStart" type="time" fluid autofocus />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="sh-end" class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
            Fin
          </label>
          <InputText id="sh-end" v-model="fEnd" type="time" fluid />
        </div>
      </div>

      <!-- Live preview on the same 24 h rail the calendar uses. -->
      <div class="rounded-lg border border-line bg-app px-3 py-2.5">
        <div class="relative h-1.5 w-full rounded-full bg-hairline">
          <div
            v-if="preview"
            class="absolute inset-y-0 rounded-full bg-ember transition-all duration-150"
            :style="{ left: `${preview.left}%`, width: `${preview.width}%` }"
          />
        </div>
        <p class="mt-1.5 flex justify-between font-mono text-[9px] uppercase tracking-[0.14em] text-steel-400">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
        </p>
        <p class="mt-1 text-center font-mono text-[11px] text-steel-500">
          <template v-if="hours">
            Turno de <span class="text-ink">{{ hours }} h</span>
          </template>
          <template v-else>Elige el rango horario</template>
        </p>
      </div>

      <p v-if="fStart && fEnd && !rangeValid" class="font-mono text-[11px] text-alert">
        La hora de fin debe ser posterior a la de inicio.
      </p>
      <p
        v-if="error"
        role="alert"
        class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
      >
        {{ error }}
      </p>
    </div>

    <template #footer>
      <Button label="Cancelar" severity="secondary" text @click="emit('update:visible', false)" />
      <Button label="Agregar" :loading="saving" :disabled="!canSubmit" @click="submit" />
    </template>
  </Dialog>
</template>
