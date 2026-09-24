<script setup lang="ts">
// "Estados": lo que el número publica solo, a su hora, en la pestaña de Novedades.
//
// Es la primera pantalla del canal que EMITE sin que nadie pregunte, y no rompe la regla de no
// escribir primero porque un estado no aterriza en ninguna conversación: sale en Novedades, lo abre
// quien quiere, y caduca solo a las 24 horas.
//
// Tres decisiones dan forma a la pantalla, y las tres son deliberadas:
//
// 1. **La vista previa ES la tarjeta.** Color de fondo y fuente son los dos únicos parámetros que
//    WhatsApp exige, así que son las dos únicas cosas que una previa podría equivocar. Se pintan de
//    verdad. Ver `StatusPreview.vue`.
// 2. **No hay selector de "una vez / recurrente".** Marcar los siete días ES "todos los días". Un
//    modo aparte sería un segundo sitio decidiendo el mismo hecho, capaz de contradecir a los días
//    marcados — y el que gana en silencio siempre es el de abajo.
// 3. **La audiencia se cuenta con sus bajas ANTES de guardar.** Una cifra sola se lee como
//    cobertura completa de los contactos del negocio, y no lo es. Ver `AudienceMeter.vue`.
//
// Y una cosa que la pantalla NO dice nunca: cuántos lo vieron. El proveedor no devuelve vistas y
// devuelve 201 aunque se le caigan tandas de destinatarios, así que "publicado" y "enviado a N" es
// lo más fuerte que se puede afirmar aquí.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import AudienceMeter from '@/components/messaging/statuses/AudienceMeter.vue'
import StatusPreview from '@/components/messaging/statuses/StatusPreview.vue'
import { detailOf } from '@/lib/apiError'
import {
  addressedLabel,
  BACKGROUNDS,
  describeSchedule,
  draftErrors,
  FONTS,
  minuteToTime,
  minutesOfWeekday,
  publicationGlyph,
  publicationLabel,
  timeToMinute,
  WEEKDAYS,
} from '@/lib/whatsappStatuses'
import {
  createStatus,
  deleteStatus,
  listStatusPublications,
  listStatuses,
  previewStatusAudience,
  updateStatus,
  uploadStatusImage,
  type AudiencePreview,
  type StatusDraft,
  type StatusPublication,
  type StatusSlot,
  type WhatsAppStatus,
} from '@/services/messaging.api'
import { useBranchStore } from '@/stores/branch'

const branchStore = useBranchStore()

const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)
const uploading = ref(false)

const statuses = ref<WhatsAppStatus[]>([])
const audience = ref<AudiencePreview | null>(null)
const publications = ref<StatusPublication[]>([])

// La selección se guarda por ID y no por objeto: recargar la lista deja el objeto viejo huérfano y
// el detalle se queda mirando datos que ya no existen.
const selectedId = ref<string | null>(null)
const draft = ref<StatusDraft | null>(null)
// La hora que se está escribiendo, aparte del borrador: es un `input` de texto y no puede tumbar el
// horario mientras está a medio teclear.
const timeInput = ref('11:00')
const pickedDays = ref<number[]>([])
const dateInput = ref('')

const errors = computed(() => (draft.value ? draftErrors(draft.value) : []))
const canSave = computed(() => draft.value !== null && errors.value.length === 0)

function emptyDraft(): StatusDraft {
  return {
    type: 'text',
    content: '',
    slots: [],
    bg_color: BACKGROUNDS[0],
    font: FONTS[0].value,
    caption: null,
    media_url: null,
    active: true,
  }
}

function draftOf(status: WhatsAppStatus): StatusDraft {
  return {
    type: status.type,
    content: status.content,
    slots: status.slots.map((s) => ({ ...s })),
    bg_color: status.bg_color,
    font: status.font,
    caption: status.caption,
    media_url: status.media_url,
    active: status.active,
  }
}

async function load(): Promise<void> {
  const branchId = branchStore.activeBranchId
  if (!branchId) return
  loading.value = true
  loadError.value = false
  try {
    const [list, preview] = await Promise.all([
      listStatuses(branchId),
      previewStatusAudience(branchId),
    ])
    statuses.value = list
    audience.value = preview
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function loadPublications(statusId: string): Promise<void> {
  const branchId = branchStore.activeBranchId
  if (!branchId) return
  try {
    publications.value = await listStatusPublications(branchId, statusId)
  } catch {
    publications.value = []
  }
}

function startNew(): void {
  selectedId.value = null
  draft.value = emptyDraft()
  publications.value = []
  resetSlotInputs()
}

function select(status: WhatsAppStatus): void {
  selectedId.value = status.id
  draft.value = draftOf(status)
  resetSlotInputs()
  void loadPublications(status.id)
}

function resetSlotInputs(): void {
  pickedDays.value = []
  dateInput.value = ''
  timeInput.value = '11:00'
}

/** Añade la hora escrita a los días marcados. Siete días marcados = "todos los días". */
function addWeeklySlots(): void {
  const minute = timeToMinute(timeInput.value)
  if (minute === null || !draft.value || pickedDays.value.length === 0) return
  const existing = new Set(
    draft.value.slots.map((s) => `${s.weekday}|${s.on_date}|${s.minute}`),
  )
  for (const weekday of pickedDays.value) {
    const key = `${weekday}|null|${minute}`
    if (existing.has(key)) continue
    draft.value.slots.push({ minute, weekday, on_date: null })
  }
  pickedDays.value = []
}

function addDatedSlot(): void {
  const minute = timeToMinute(timeInput.value)
  if (minute === null || !draft.value || !dateInput.value) return
  draft.value.slots.push({ minute, weekday: null, on_date: dateInput.value })
  dateInput.value = ''
}

function removeSlot(slot: StatusSlot): void {
  if (!draft.value) return
  draft.value.slots = draft.value.slots.filter((s) => s !== slot)
}

function toggleDay(index: number): void {
  const at = pickedDays.value.indexOf(index)
  if (at === -1) pickedDays.value.push(index)
  else pickedDays.value.splice(at, 1)
}

/** Marca los siete de golpe. Es el atajo del caso más común, no un modo aparte. */
function pickEveryDay(): void {
  pickedDays.value = WEEKDAYS.map((d) => d.index)
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !draft.value) return
  uploading.value = true
  saveError.value = null
  try {
    draft.value.media_url = await uploadStatusImage(file)
    draft.value.content = draft.value.media_url
  } catch (error) {
    saveError.value = detailOf(error) ?? 'No se pudo subir la imagen.'
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function save(): Promise<void> {
  const branchId = branchStore.activeBranchId
  if (!branchId || !draft.value || !canSave.value) return
  saving.value = true
  saveError.value = null
  try {
    const saved = selectedId.value
      ? await updateStatus(branchId, selectedId.value, draft.value)
      : await createStatus(branchId, draft.value)
    await load()
    select(saved)
  } catch (error) {
    // El 422 del backend manda: la validación local es un ensayo, no la verdad.
    saveError.value = detailOf(error) ?? 'No se pudo guardar el estado.'
  } finally {
    saving.value = false
  }
}

async function remove(): Promise<void> {
  const branchId = branchStore.activeBranchId
  if (!branchId || !selectedId.value) return
  saving.value = true
  try {
    await deleteStatus(branchId, selectedId.value)
    draft.value = null
    selectedId.value = null
    await load()
  } catch (error) {
    saveError.value = detailOf(error) ?? 'No se pudo borrar el estado.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => branchStore.activeBranchId, load)
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-6xl flex-col gap-5 p-4 pb-24 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · WhatsApp
          </p>
          <h1 class="font-display text-2xl text-graphite-900">Estados</h1>
          <p class="mt-1 max-w-2xl text-sm leading-relaxed text-steel-600">
            Lo que el número publica solo en Novedades, a la hora que le pongas. Sólo lo ve quien
            tenga el número guardado, y desaparece a las 24 horas.
          </p>
        </header>

        <p v-if="loading" class="text-sm text-steel-600">Cargando…</p>
        <p v-else-if="loadError" class="text-sm text-graphite-900">
          No se pudieron cargar los estados.
          <button class="underline" @click="load">Reintentar</button>
        </p>

        <div v-else class="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <!-- Lista -->
          <section class="flex flex-col gap-2">
            <button
              class="rounded-lg border border-dashed border-steel-300 px-3 py-2 text-sm text-graphite-900"
              data-testid="new-status"
              @click="startNew"
            >
              + Estado nuevo
            </button>

            <p v-if="!statuses.length" class="text-sm text-steel-600">
              Todavía no hay ningún estado programado.
            </p>

            <ul class="flex flex-col gap-2">
              <li v-for="status in statuses" :key="status.id">
                <button
                  class="w-full rounded-lg border px-3 py-2 text-left"
                  :class="
                    status.id === selectedId
                      ? 'border-graphite-900 bg-paper'
                      : 'border-steel-300/60'
                  "
                  :data-testid="`status-row-${status.id}`"
                  @click="select(status)"
                >
                  <span class="block truncate text-sm text-graphite-900">
                    {{ status.type === 'image' ? (status.caption || 'Imagen') : status.content }}
                  </span>
                  <span class="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
                    {{ describeSchedule(status.slots) || 'sin horario' }}
                    <template v-if="!status.active"> · apagado</template>
                  </span>
                </button>
              </li>
            </ul>
          </section>

          <!-- Detalle -->
          <section v-if="draft" class="flex flex-col gap-4" data-testid="status-editor">
            <div class="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <StatusPreview
                :type="draft.type"
                :content="draft.content"
                :bg-color="draft.bg_color"
                :font="draft.font"
                :caption="draft.caption"
                :media-url="draft.media_url"
              />

              <div class="flex flex-col gap-3">
                <div class="flex gap-2">
                  <button
                    v-for="option in (['text', 'image'] as const)"
                    :key="option"
                    class="rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                    :class="
                      draft.type === option
                        ? 'border-graphite-900 text-graphite-900'
                        : 'border-steel-300 text-steel-500'
                    "
                    :data-testid="`type-${option}`"
                    @click="draft.type = option"
                  >
                    {{ option === 'text' ? 'Texto' : 'Imagen' }}
                  </button>
                </div>

                <template v-if="draft.type === 'text'">
                  <textarea
                    v-model="draft.content"
                    rows="3"
                    class="w-full rounded border border-steel-300 p-2 text-sm"
                    placeholder="Hoy hay sancocho de gallina"
                    data-testid="status-content"
                  />

                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
                      Fondo
                    </p>
                    <div class="mt-1 flex gap-1.5">
                      <button
                        v-for="color in BACKGROUNDS"
                        :key="color"
                        class="h-7 w-7 rounded-full ring-offset-2"
                        :class="draft.bg_color === color ? 'ring-2 ring-graphite-900' : ''"
                        :style="{ backgroundColor: color }"
                        :data-testid="`bg-${color}`"
                        :aria-label="`Fondo ${color}`"
                        @click="draft.bg_color = color"
                      />
                    </div>
                  </div>

                  <div>
                    <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
                      Fuente
                    </p>
                    <div class="mt-1 flex flex-wrap gap-1.5">
                      <button
                        v-for="option in FONTS"
                        :key="option.value"
                        class="rounded border px-2 py-1 text-xs"
                        :class="
                          draft.font === option.value
                            ? 'border-graphite-900 text-graphite-900'
                            : 'border-steel-300 text-steel-600'
                        "
                        :data-testid="`font-${option.value}`"
                        @click="draft.font = option.value"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <input
                    type="file"
                    accept="image/*"
                    class="text-sm"
                    data-testid="status-image"
                    @change="onFile"
                  />
                  <p v-if="uploading" class="text-xs text-steel-600">Subiendo…</p>
                  <input
                    v-model="draft.caption"
                    class="w-full rounded border border-steel-300 p-2 text-sm"
                    placeholder="Pie de la imagen (opcional)"
                    data-testid="status-caption"
                  />
                </template>
              </div>
            </div>

            <!-- El horario. Franjas, no cron; y ningún selector de recurrencia. -->
            <section class="rounded-lg border border-steel-300/50 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
                Cuándo sale
              </p>

              <div class="mt-2 flex flex-wrap items-center gap-2">
                <input
                  v-model="timeInput"
                  class="w-20 rounded border border-steel-300 p-1 text-center font-mono text-sm"
                  data-testid="slot-time"
                  aria-label="Hora"
                />
                <div class="flex gap-1">
                  <button
                    v-for="day in WEEKDAYS"
                    :key="day.index"
                    class="h-8 w-8 rounded border font-mono text-xs"
                    :class="
                      pickedDays.includes(day.index)
                        ? 'border-graphite-900 bg-graphite-900 text-white'
                        : 'border-steel-300 text-steel-600'
                    "
                    :title="day.label"
                    :data-testid="`day-${day.index}`"
                    @click="toggleDay(day.index)"
                  >
                    {{ day.short }}
                  </button>
                </div>
                <button
                  class="rounded border border-steel-300 px-2 py-1 text-xs text-steel-600"
                  data-testid="pick-every-day"
                  @click="pickEveryDay"
                >
                  Todos
                </button>
                <button
                  class="rounded border border-graphite-900 px-2 py-1 text-xs text-graphite-900"
                  data-testid="add-weekly"
                  @click="addWeeklySlots"
                >
                  Añadir
                </button>
              </div>

              <div class="mt-2 flex flex-wrap items-center gap-2">
                <input
                  v-model="dateInput"
                  type="date"
                  class="rounded border border-steel-300 p-1 text-sm"
                  data-testid="slot-date"
                  aria-label="Fecha concreta"
                />
                <button
                  class="rounded border border-steel-300 px-2 py-1 text-xs text-steel-600"
                  data-testid="add-dated"
                  @click="addDatedSlot"
                >
                  Añadir un día concreto
                </button>
              </div>

              <!-- La semana, a mano: siete columnas con las horas ocupadas dentro. -->
              <div class="mt-3 grid grid-cols-7 gap-1" data-testid="week-grid">
                <div v-for="day in WEEKDAYS" :key="day.index" class="min-w-0">
                  <p class="text-center font-mono text-[10px] text-steel-500">
                    {{ day.short }}
                  </p>
                  <div class="mt-1 flex flex-col gap-0.5">
                    <span
                      v-for="minute in minutesOfWeekday(draft.slots, day.index)"
                      :key="minute"
                      class="rounded bg-graphite-900/90 px-0.5 py-0.5 text-center font-mono text-[10px] text-white"
                      :data-testid="`slot-${day.index}-${minute}`"
                    >
                      {{ minuteToTime(minute) }}
                    </span>
                  </div>
                </div>
              </div>

              <ul v-if="draft.slots.length" class="mt-2 flex flex-wrap gap-1.5">
                <li v-for="slot in draft.slots" :key="`${slot.weekday}-${slot.on_date}-${slot.minute}`">
                  <button
                    class="rounded border border-steel-300 px-2 py-0.5 font-mono text-[10px] text-steel-600"
                    @click="removeSlot(slot)"
                  >
                    {{ slot.on_date ?? WEEKDAYS[slot.weekday ?? 0]?.short }}
                    {{ minuteToTime(slot.minute) }} ✕
                  </button>
                </li>
              </ul>
              <p class="mt-2 text-xs text-steel-600">
                {{ describeSchedule(draft.slots) || 'Sin horario: no va a salir solo.' }}
              </p>
            </section>

            <AudienceMeter v-if="audience" :preview="audience" />

            <ul v-if="errors.length" class="flex flex-col gap-0.5" data-testid="draft-errors">
              <li v-for="error in errors" :key="error" class="text-xs text-graphite-900">
                {{ error }}
              </li>
            </ul>
            <p v-if="saveError" class="text-xs text-graphite-900" data-testid="save-error">
              {{ saveError }}
            </p>

            <div class="flex items-center gap-2">
              <button
                class="rounded bg-graphite-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                :disabled="!canSave || saving"
                data-testid="save-status"
                @click="save"
              >
                {{ saving ? 'Guardando…' : 'Guardar' }}
              </button>
              <label class="flex items-center gap-1.5 text-xs text-steel-600">
                <input v-model="draft.active" type="checkbox" data-testid="status-active" />
                Encendido
              </label>
              <button
                v-if="selectedId"
                class="ml-auto text-xs text-steel-500 underline"
                data-testid="delete-status"
                @click="remove"
              >
                Borrar
              </button>
            </div>

            <!-- Qué pasó. Publicado / falló / los dos omitidos. Nunca "visto por". -->
            <section v-if="selectedId" class="rounded-lg border border-steel-300/50 p-3">
              <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-steel-500">
                Historial
              </p>
              <p v-if="!publications.length" class="mt-1 text-xs text-steel-600">
                Todavía no se ha publicado ninguna vez.
              </p>
              <ul v-else class="mt-1 flex flex-col gap-1" data-testid="publication-log">
                <li
                  v-for="entry in publications"
                  :key="entry.id"
                  class="flex flex-wrap items-baseline gap-x-2 text-xs"
                  :data-state="entry.state"
                >
                  <span class="font-mono text-steel-500">
                    {{ entry.fired_for_date }} {{ minuteToTime(entry.minute) }}
                  </span>
                  <span class="text-graphite-900">
                    <span aria-hidden="true">{{ publicationGlyph(entry.state) }}</span>
                    {{ publicationLabel(entry.state) }}
                  </span>
                  <span class="text-steel-600">
                    {{ addressedLabel(entry.addressed_count) }}
                  </span>
                  <span
                    v-if="entry.state === 'skipped_late'"
                    class="text-steel-500"
                  >
                    ({{ entry.late_by_minutes }} min tarde)
                  </span>
                </li>
              </ul>
            </section>
          </section>

          <p v-else class="text-sm text-steel-600">
            Elige un estado de la lista, o crea uno nuevo.
          </p>
        </div>
      </div>
    </main>
  </AppShell>
</template>
