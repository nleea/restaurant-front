<script setup lang="ts">
// "Respuestas automáticas": el saludo, los avisos de pedido y la vida de los enlaces.
//
// Cero LLM. Todo lo que se edita aquí es texto determinista sobre datos que el sistema ya
// tiene —los horarios de la sede y el ciclo de vida del pedido— y por eso no cuesta nada
// mandarlo. Es la pieza que un dueño de restaurante enseña como "el bot de WhatsApp".
//
// Dos decisiones dan forma a la pantalla:
//
// 1. **Se edita el comportamiento EFECTIVO, no la fila.** El backend fusiona lo guardado
//    sobre un mapeo de fábrica, así que un tenant sin fila igual manda cuatro avisos. Si la
//    pantalla enseñara sólo lo guardado, mostraría todo apagado mientras el número escribe.
//    Al cargar se materializan las seis transiciones con su valor vigente.
// 2. **La vista previa es local; la validación buena es del servidor.** Se avisa de un
//    marcador inexistente mientras se escribe, pero quien manda es el 422 del backend, que
//    nombra al culpable. Un texto roto se descubre aquí, no a las 8pm con un cliente esperando.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import GreetingSection from '@/components/messaging/autoreply/GreetingSection.vue'
import StatusMappingSection from '@/components/messaging/autoreply/StatusMappingSection.vue'
import FaqSection from '@/components/messaging/autoreply/FaqSection.vue'
import QuickReplySection from '@/components/messaging/autoreply/QuickReplySection.vue'
import ConversationSection from '@/components/messaging/autoreply/ConversationSection.vue'
import { detailOf } from '@/lib/apiError'
import {
  formatNextOpening,
  materializeFaqs,
  nextOpening,
  placeholderErrors,
  TRANSITIONS,
} from '@/lib/whatsappAutoreply'
import {
  getBranchHours,
  getBusinessProfile,
  type BusinessProfile,
  type OperatingHoursWindow,
} from '@/services/business.api'
import { materializeQuickReplies, quickReplyErrors } from '@/lib/quickReplies'
import {
  getAutoreplySettings,
  saveAutoreplySettings,
  type AutoreplySettings,
  type FaqEntry,
  type QuickReply,
  type StatusMessage,
} from '@/services/messaging.api'
import { useBranchStore } from '@/stores/branch'

const branchStore = useBranchStore()

const loading = ref(true)
const loadError = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)
const savedAt = ref<number | null>(null)

const placeholders = ref<{
  greeting: string[]
  order: string[]
  faq: string[]
  awaiting: string[]
}>({ greeting: [], order: [], faq: [], awaiting: [] })
const assistantAvailable = ref(false)
const defaultMapping = ref<Record<string, StatusMessage>>({})
const suggestedFaqs = ref<FaqEntry[]>([])
const suggestedQuickReplies = ref<QuickReply[]>([])

const draft = ref<AutoreplySettings | null>(null)
// Lo que había al cargar (ya materializado), para saber si hay algo que guardar.
const baseline = ref<string>('')

const dirty = computed(() => draft.value !== null && JSON.stringify(draft.value) !== baseline.value)

// Un marcador que no existe apaga el guardado. El backend lo rechazaría igual con un 422 que
// nombra al culpable —y sigue siendo el juez—, pero descubrirlo aquí evita el viaje.
const invalidPlaceholders = computed(() =>
  draft.value
    ? placeholderErrors({
        greetingOpenText: draft.value.greeting_open_text,
        greetingClosedText: draft.value.greeting_closed_text,
        awaitingText: draft.value.greeting_awaiting_payment_text,
        awaitingPlaceholders: placeholders.value.awaiting,
        statusMapping: draft.value.status_mapping,
        greetingPlaceholders: placeholders.value.greeting,
        orderPlaceholders: placeholders.value.order,
        faqs: draft.value.faqs,
        faqPlaceholders: placeholders.value.faq,
      })
    : [],
)
// Las plantillas tienen sus propios problemas —longitud, nombre vacío, marcadores— y también
// apagan el guardado: el backend las rechazaría con un 422 y el viaje sobra.
const quickReplyProblems = computed(() =>
  draft.value ? quickReplyErrors(draft.value.quick_replies ?? []) : [],
)
const canSave = computed(
  () =>
    dirty.value && invalidPlaceholders.value.length === 0 && quickReplyProblems.value.length === 0,
)

/** Las seis transiciones con su valor vigente: lo guardado por encima de lo de fábrica. */
function materialize(
  saved: Record<string, StatusMessage>,
  defaults: Record<string, StatusMessage>,
): Record<string, StatusMessage> {
  const out: Record<string, StatusMessage> = {}
  for (const state of TRANSITIONS) {
    const base = defaults[state] ?? { enabled: false, text: '' }
    const override = saved[state]
    out[state] = { enabled: override?.enabled ?? base.enabled, text: override?.text || base.text }
  }
  return out
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = false
  try {
    const data = await getAutoreplySettings()
    placeholders.value = {
      greeting: data.greeting_placeholders,
      order: data.order_placeholders,
      faq: data.faq_placeholders,
      awaiting: data.awaiting_payment_placeholders,
    }
    assistantAvailable.value = data.assistant_available
    defaultMapping.value = data.default_status_mapping
    suggestedFaqs.value = data.suggested_faqs
    suggestedQuickReplies.value = data.suggested_quick_replies
    draft.value = {
      ...data.settings,
      status_mapping: materialize(data.settings.status_mapping, data.default_status_mapping),
      // `null` (nunca las tocó) se materializa con las sugeridas, que llegan APAGADAS. A partir
      // de aquí el borrador siempre es una lista: guardar `[]` es una decisión que se respeta, y
      // por eso borrarlas todas no las devuelve en la siguiente carga.
      faqs: materializeFaqs(data.settings.faqs, data.suggested_faqs),
      // Aquí NO se siembran las sugeridas: el `null` se materializa vacío y el dueño las adopta
      // a mano. Sembrarlas dejaría el formulario "sucio" sin que nadie haya escrito nada, y
      // guardar sin querer metería en el chat plantillas que nadie aprobó.
      quick_replies: materializeQuickReplies(data.settings.quick_replies, []),
    }
    baseline.value = JSON.stringify(draft.value)
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!draft.value || saving.value || !canSave.value) return
  saving.value = true
  saveError.value = null
  try {
    const saved = await saveAutoreplySettings(draft.value)
    draft.value = {
      ...saved,
      status_mapping: materialize(saved.status_mapping, defaultMapping.value),
      faqs: saved.faqs ?? [],
      quick_replies: saved.quick_replies ?? [],
    }
    baseline.value = JSON.stringify(draft.value)
    savedAt.value = Date.now()
  } catch (e) {
    // El backend nombra el marcador que sobra; repetir su mensaje es más útil que el nuestro.
    saveError.value = detailOf(e) ?? 'No se pudieron guardar los ajustes.'
  } finally {
    saving.value = false
  }
}

function restoreMapping(): void {
  if (!draft.value) return
  draft.value.status_mapping = materialize({}, defaultMapping.value)
}

// El borrador siempre edita una LISTA; el `null` sólo existe en el cable (significa "este
// tenant nunca las tocó"). Este puente evita que el componente tenga que saber de esa
// diferencia y que la pantalla trate un `null` como si fuera una lista vacía.
const draftFaqs = computed<FaqEntry[]>({
  get: () => draft.value?.faqs ?? [],
  set: (value) => {
    if (draft.value) draft.value.faqs = value
  },
})

function restoreFaqs(): void {
  if (!draft.value) return
  draft.value.faqs = materializeFaqs(null, suggestedFaqs.value)
}

const draftQuickReplies = computed<QuickReply[]>({
  get: () => draft.value?.quick_replies ?? [],
  set: (value) => {
    if (draft.value) draft.value.quick_replies = value
  },
})

// --- Vista previa por sucursal ----------------------------------------------
// El saludo es un texto para N sedes: `{branch_name}`, `{menu_link}` y `{next_opening}` se
// resuelven contra la que recibió el mensaje. Por eso la vista previa elige sucursal.
const previewBranchId = ref<string | null>(null)
const hoursByBranch = ref<Record<string, OperatingHoursWindow[]>>({})

// La vista previa se pinta con los datos REALES del Perfil del negocio, no con textos de
// relleno. Es lo que hace visible el fallo que originó esto: un saludo que dice "Main Branch"
// porque nadie renombró la sucursal se ve aquí antes de salir por WhatsApp.
const business = ref<BusinessProfile | null>(null)

const previewBranch = computed(
  () => branchStore.branches.find((b) => b.id === previewBranchId.value) ?? null,
)

/** Lo que el saludo dirá de este negocio. Los textos de relleno sólo salen sin perfil. */
const identity = computed(() => {
  const branch = business.value?.branches.find((b) => b.id === previewBranchId.value)
  return {
    businessName: business.value?.name || 'Tu negocio',
    branchName: branch?.name ?? previewBranch.value?.name ?? 'Tu sucursal',
    branchAddress: branch?.address ?? undefined,
    branchPhone: branch?.phone ?? undefined,
  }
})

/** El enlace real que le tocaría a esa sede. El token va abreviado: es por conversación. */
const previewLink = computed(() => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const code = previewBranch.value?.code
  return code ? `${origin}/store/${code}?t=…` : `${origin}/store?t=…`
})

const previewNextOpening = computed(() => {
  const windows = previewBranchId.value ? hoursByBranch.value[previewBranchId.value] : undefined
  if (!windows?.length) return null
  const now = new Date()
  // El backend usa 0=lunes … 6=domingo; `getDay()` usa 0=domingo.
  const weekday = (now.getDay() + 6) % 7
  return formatNextOpening(
    nextOpening(windows, weekday, now.getHours() * 60 + now.getMinutes()),
    weekday,
  )
})

async function ensureHours(branchId: string): Promise<void> {
  if (hoursByBranch.value[branchId]) return
  try {
    hoursByBranch.value[branchId] = await getBranchHours(branchId)
  } catch {
    // Sin horarios la variante de cerrado enseña el marcador sin resolver, que es la verdad.
    hoursByBranch.value[branchId] = []
  }
}

watch(previewBranchId, (id) => {
  if (id) void ensureHours(id)
})

onMounted(async () => {
  await branchStore.ensureLoaded()
  // Sin perfil la vista previa sigue pintando, con los textos de relleno: un fallo al leer
  // el negocio no puede dejar la pantalla de ajustes en blanco.
  business.value = await getBusinessProfile().catch(() => null)
  previewBranchId.value = branchStore.activeBranchId ?? branchStore.branches[0]?.id ?? null
  await load()
})
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-4xl flex-col gap-5 p-4 pb-24 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · WhatsApp
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Respuestas automáticas</h1>
          <p class="text-steel-500">
            Lo que el número contesta solo, sin que nadie escriba. Un texto para todas las
            sucursales; cada una pone su nombre, su enlace y sus horarios.
          </p>
        </header>

        <p v-if="loading" class="font-mono text-[11px] text-steel-500">Cargando…</p>

        <p
          v-else-if="loadError"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          No se pudieron cargar los ajustes.
          <button type="button" class="underline" @click="load">Reintentar</button>
        </p>

        <template v-else-if="draft">
          <GreetingSection
            v-model:enabled="draft.greeting_enabled"
            v-model:open-text="draft.greeting_open_text"
            v-model:closed-text="draft.greeting_closed_text"
            v-model:awaiting-text="draft.greeting_awaiting_payment_text"
            :placeholders="placeholders.greeting"
            :awaiting-placeholders="placeholders.awaiting"
            :branches="branchStore.branches"
            :preview-branch-id="previewBranchId"
            :identity="identity"
            :preview-link="previewLink"
            :preview-next-opening="previewNextOpening"
            :assistant-offer="draft.assistant_offer_enabled"
            :disabled="saving"
            @update:preview-branch-id="previewBranchId = $event"
          />

          <StatusMappingSection
            v-model:mapping="draft.status_mapping"
            :placeholders="placeholders.order"
            :disabled="saving"
            @restore="restoreMapping"
          />

          <FaqSection
            v-model:faqs="draftFaqs"
            :placeholders="placeholders.faq"
            :disabled="saving"
            @restore="restoreFaqs"
          />

          <!-- Justo después de las FAQs: es donde el dueño llega buscando "que conteste algo",
               y donde tiene que leer que estas dos cosas no son la misma. -->
          <QuickReplySection
            v-model:entries="draftQuickReplies"
            :suggested="suggestedQuickReplies"
            :disabled="saving"
          />

          <ConversationSection
            v-model:idle-hours="draft.idle_hours"
            v-model:token-hours="draft.token_lifetime_hours"
            v-model:assistant-offer="draft.assistant_offer_enabled"
            :assistant-available="assistantAvailable"
            :disabled="saving"
          />

          <p
            v-if="saveError"
            role="alert"
            class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs leading-relaxed text-alert"
            data-testid="save-error"
          >
            {{ saveError }}
          </p>
        </template>
      </div>

      <!-- Barra de guardado. Fija abajo porque el editor es largo y el cambio que importa
           puede estar en la primera sección. -->
      <div
        v-if="draft && !loading"
        class="sticky bottom-0 border-t border-line bg-paper/95 backdrop-blur"
      >
        <div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p class="font-mono text-[11px] text-steel-500">
            <span v-if="invalidPlaceholders.length" class="text-alert" data-testid="invalid-hint">
              No existe {{ invalidPlaceholders.join(', ') }}: corrígelo para poder guardar.
            </span>
            <span v-else-if="dirty">Hay cambios sin guardar.</span>
            <span v-else-if="savedAt" class="text-success">Guardado.</span>
            <span v-else>Todo al día.</span>
          </p>
          <button
            type="button"
            :disabled="!canSave || saving"
            data-testid="save"
            class="rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember-600 disabled:opacity-40"
            @click="save"
          >
            {{ saving ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      </div>
    </main>
  </AppShell>
</template>
