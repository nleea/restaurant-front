<script setup lang="ts">
// Las tarifas de domicilio por kilómetros: la escalera de precios de la sede.
//
// Vive junto al panel de radios y no dentro porque son dos cosas distintas que la gente confunde:
// los anillos son OPERATIVOS (quién reparte dónde), las bandas son DINERO (cuánto cuesta). Que
// compartan pantalla ayuda; que compartan control haría que cambiar un color moviera un precio.
//
// La firma es que la escalera ES la cobertura: cada peldaño ocupa su tramo real sobre la misma
// regla, así que "hasta dónde repartimos" se lee sin sumar nada. El último termina en un borde
// ember duro, que es el único hecho con consecuencias reales: más allá no se cotiza, no se cobra
// y el pedido queda esperando a que una persona decida.
import { computed } from 'vue'
import {
  PRICING_BUFFER_KM,
  bandsAreValid,
  coverageKm,
  describeBands,
  planError,
  type BandDraft,
} from '@/lib/tariffBands'

const props = defineProps<{
  bands: BandDraft[]
  open: boolean
  saving?: boolean
  /** Sin `delivery.manage`: se ve el plan, no se toca. */
  readonly?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:bands', value: BandDraft[]): void
  (e: 'update:open', value: boolean): void
  (e: 'save'): void
}>()

const rows = computed(() => describeBands(props.bands))
const coverage = computed(() => coverageKm(props.bands))
const error = computed(() => planError(props.bands))
const canSave = computed(() => !props.readonly && !props.saving && bandsAreValid(props.bands))

/** La escala de la regla. El último tramo manda; con el plan roto se usa lo que haya. */
const scaleKm = computed(() => {
  const maxima = props.bands.map((b) => Number(String(b.maxKm).replace(',', '.')))
  const top = Math.max(...maxima.filter(Number.isFinite), 1)
  return top
})
const spanOf = (fromKm: number, maxKm: string) => {
  const to = Number(String(maxKm).replace(',', '.'))
  if (!Number.isFinite(to) || to <= fromKm) return { left: '0%', width: '0%' }
  return {
    left: `${(fromKm / scaleKm.value) * 100}%`,
    width: `${((to - fromKm) / scaleKm.value) * 100}%`,
  }
}

function patch(index: number, field: 'maxKm' | 'fee', value: string) {
  const next = props.bands.map((b, i) => (i === index ? { ...b, [field]: value } : b))
  emit('update:bands', next)
}
function addBand() {
  // Nace un kilómetro más allá del borde actual: es lo que casi siempre se quiere, y evita que
  // la banda nueva aparezca ya en rojo por llegar menos lejos que la anterior.
  const last = props.bands[props.bands.length - 1]
  const nextKm = last ? Number(String(last.maxKm).replace(',', '.')) + 1 : 2
  emit('update:bands', [
    ...props.bands,
    { maxKm: Number.isFinite(nextKm) ? String(nextKm) : '', fee: last?.fee ?? '' },
  ])
}
function removeBand(index: number) {
  emit('update:bands', props.bands.filter((_, i) => i !== index))
}
</script>

<template>
  <section
    class="pointer-events-auto w-[300px] overflow-hidden rounded-2xl bg-paper shadow-[0_18px_44px_-18px_rgb(0_0_0/0.45)] ring-1 ring-black/10"
  >
    <button
      type="button"
      class="flex w-full items-center justify-between gap-2 bg-graphite-900 px-3.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :aria-expanded="open"
      data-testid="tariff-toggle"
      @click="emit('update:open', !open)"
    >
      <span class="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/80">
        Tarifas de domicilio
      </span>
      <span class="flex items-center gap-2">
        <span class="font-mono text-[11px] font-bold tabular-nums text-ember">
          {{ coverage !== null ? `${coverage} km` : '—' }}
        </span>
        <i class="pi text-[10px] text-paper/50" :class="open ? 'pi-chevron-down' : 'pi-chevron-up'" />
      </span>
    </button>

    <div v-if="open" class="flex flex-col gap-3 p-3.5">
      <!-- La escalera: cada peldaño sobre la MISMA regla, así la cobertura se lee de un vistazo -->
      <div v-if="bands.length" class="flex flex-col gap-1.5" aria-hidden="true">
        <div
          v-for="(row, i) in rows"
          :key="`rung-${i}`"
          class="relative h-2 w-full rounded-full bg-sunken"
        >
          <span
            class="absolute inset-y-0 rounded-full transition-all duration-200"
            :class="row.error ? 'bg-alert-400/50' : row.isEdge ? 'bg-ember' : 'bg-steel-400'"
            :style="spanOf(row.fromKm, row.maxKm)"
          />
        </div>
      </div>

      <ul class="flex flex-col gap-2">
        <li v-for="(row, i) in rows" :key="`band-${i}`" class="flex flex-col gap-1">
          <div class="flex items-center gap-1.5">
            <span
              class="w-10 shrink-0 font-mono text-[10px] tabular-nums text-steel-500"
              :title="`Desde ${row.fromKm} km`"
            >
              {{ row.fromKm }}–
            </span>
            <input
              :value="row.maxKm"
              :disabled="readonly"
              inputmode="decimal"
              aria-label="Hasta cuántos kilómetros"
              class="w-14 rounded border border-line bg-paper px-1.5 py-1 text-right font-mono text-[12px] tabular-nums disabled:opacity-60"
              :class="row.error ? 'border-alert-400' : ''"
              @input="patch(i, 'maxKm', ($event.target as HTMLInputElement).value)"
            />
            <span class="font-mono text-[10px] text-steel-500">km</span>
            <input
              :value="row.fee"
              :disabled="readonly"
              inputmode="numeric"
              aria-label="Tarifa de esta banda"
              class="min-w-0 flex-1 rounded border border-line bg-paper px-1.5 py-1 text-right font-mono text-[12px] tabular-nums disabled:opacity-60"
              :class="row.error ? 'border-alert-400' : ''"
              @input="patch(i, 'fee', ($event.target as HTMLInputElement).value)"
            />
            <button
              v-if="!readonly"
              type="button"
              class="grid size-6 shrink-0 place-items-center rounded text-steel-400 transition hover:bg-sunken hover:text-alert-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
              :aria-label="`Quitar la banda hasta ${row.maxKm} km`"
              @click="removeBand(i)"
            >
              <i class="pi pi-times text-[10px]" />
            </button>
          </div>
          <p v-if="row.error" class="pl-11 text-[10px] text-alert-600">{{ row.error }}</p>
        </li>
      </ul>

      <p v-if="!bands.length" class="text-[11px] leading-relaxed text-steel-500">
        Sin tarifas configuradas no se cotiza ningún domicilio: los pedidos quedan esperando y
        nadie recibe su enlace de pago.
      </p>

      <button
        v-if="!readonly"
        type="button"
        class="self-start font-mono text-[10px] uppercase tracking-[0.12em] text-steel-500 transition hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        @click="addBand"
      >
        <i class="pi pi-plus text-[9px]" /> Añadir banda
      </button>

      <!-- Lo que el operador NO puede deducir mirando los números: el colchón. -->
      <p class="border-t border-line pt-2.5 text-[10px] leading-relaxed text-steel-500">
        Al medir se suman <strong class="tabular-nums">{{ PRICING_BUFFER_KM }} km</strong> a la
        distancia en línea recta, porque nadie va en línea recta.
        <template v-if="coverage !== null">
          Con este plan se reparte hasta
          <strong class="tabular-nums text-ink">{{ coverage }} km</strong>; más lejos queda fuera
          de cobertura y no se cobra.
        </template>
      </p>

      <p v-if="error && bands.length" class="text-[11px] text-alert-600">{{ error }}</p>

      <button
        v-if="!readonly"
        type="button"
        :disabled="!canSave"
        class="rounded-lg bg-ember px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-paper transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
        data-testid="save-tariffs"
        @click="emit('save')"
      >
        {{ saving ? 'Guardando…' : 'Guardar tarifas' }}
      </button>
      <p v-else class="text-[10px] text-steel-500">
        Necesitas permiso de gestión de domicilios para cambiar las tarifas.
      </p>
    </div>
  </section>
</template>
