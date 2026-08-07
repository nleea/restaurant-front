<script setup lang="ts">
// Configuración de las alertas: qué vigila el sistema y cuánto insiste.
//
// El campo que decide si este módulo sobrevive es el **colchón de recuperación**, y es el
// que nadie entendería por su nombre. Así que no se explica como "buffer": se explica por la
// repetición que evita — "sin él, un insumo que sube y baja alrededor del mínimo vuelve a
// avisar cada vez". Y no se puede poner a cero, porque cero no es una preferencia: es el bug
// que la histéresis existe para impedir, y el backend lo rechaza igual.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import {
  BUFFER_UNIT,
  SWEEP_MINUTES,
  WHATSAPP_REESCALATION_HOURS,
  RULE_HINT,
  RULE_ICON,
  RULE_LABEL,
  THRESHOLD_LABEL,
} from '@/lib/alerts'
import type { AlertRule } from '@/services/alerts.api'
import { useAlertsStore } from '@/stores/alerts'
import { useBranchStore } from '@/stores/branch'

const alerts = useAlertsStore()
const branch = useBranchStore()

const savingKey = ref<string | null>(null)
const flash = ref<string | null>(null)
/** Borrador por regla: se edita en local y se guarda regla a regla. */
const draft = ref<Record<string, AlertRule>>({})

/**
 * Qué pasaría si una alerta escalara ahora mismo, en una frase.
 *
 * Existe porque encender el interruptor y que no llegue nada es indistinguible de que esté
 * roto, y las tres causas son invisibles desde aquí: sin número conectado, sin teléfonos
 * cargados, o —la que nadie adivina— con todo bien pero sin que nadie del personal le haya
 * escrito nunca al número, que es lo que el guardián exige para poder escribirle.
 */
const reachLabel = computed(() => {
  const reach = alerts.reach
  if (!reach) return null
  if (!reach.has_session) {
    return 'Esta sucursal no tiene un número de WhatsApp conectado, así que el aviso no saldría. Vincúlalo en Números WhatsApp.'
  }
  if (reach.subscribed === 0) {
    return 'Nadie está señalado para recibir alertas. Enciéndeselo a quien quieras avisar en su ficha, en Personal.'
  }
  if (reach.with_chat === 0) {
    return `Hay ${reach.subscribed} ${reach.subscribed === 1 ? 'persona señalada' : 'personas señaladas'}, pero ninguna tiene su chat de WhatsApp emparejado. Pídeles que le escriban al número y empareja el chat en su ficha, en Personal.`
  }
  if (reach.reachable === 0) {
    return 'Los chats emparejados ya no sirven para escribir. Vuelve a emparejarlos en Personal.'
  }
  return `Le llegaría a ${reach.reachable} ${reach.reachable === 1 ? 'persona' : 'personas'}.`
})

/** Sólo se puede encender si de verdad llegaría a alguien. */
const canEscalate = computed(() => (alerts.reach?.reachable ?? 0) > 0)

function hydrate(): void {
  draft.value = Object.fromEntries(alerts.rules.map((r) => [r.rule_key, { ...r }]))
}

async function load(branchId: string): Promise<void> {
  await alerts.loadRules(branchId)
  hydrate()
}

onMounted(async () => {
  await branch.ensureLoaded()
  if (branch.activeBranchId) await load(branch.activeBranchId)
})

watch(
  () => branch.activeBranchId,
  (id) => {
    if (id) void load(id)
  },
)

/** Cero se rechaza aquí Y en el servidor. Aquí para explicarlo; allí para garantizarlo. */
function bufferError(rule: AlertRule): string | null {
  if (rule.rule_key === 'whatsapp_session_down') return null
  if (!(rule.recovery_buffer > 0)) {
    return 'Tiene que ser mayor que cero: con cero, un valor que baila alrededor del umbral vuelve a avisar en cada revisión.'
  }
  return null
}

/**
 * Dónde queda el corte para un mínimo dado, redondeado a algo legible.
 *
 * Existe para que el porcentaje deje de ser abstracto: "10%" no le dice nada a nadie mirando una
 * pantalla de ajustes, y "de mínimo 2 se cierra al pasar de 2,2" sí. Es el mismo cálculo que hace
 * el backend (`LowStockEvaluator`), con el mismo redondeo que ve una persona.
 */
function bufferExample(buffer: number, minimum: number): string {
  const cut = minimum * (1 + (buffer || 0) / 100)
  return cut.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

function canSave(rule: AlertRule): boolean {
  return bufferError(rule) === null && rule.escalation_after_minutes >= 1
}

async function save(ruleKey: string): Promise<void> {
  const rule = draft.value[ruleKey]
  if (!rule || !canSave(rule) || savingKey.value) return
  savingKey.value = ruleKey
  flash.value = null
  if (await alerts.saveRule(rule)) {
    hydrate()
    flash.value = 'Guardado.'
  }
  savingKey.value = null
}

const inputCls =
  'rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm tabular-nums text-ink outline-none transition focus:border-ember/60 disabled:opacity-60'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · Alertas
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Qué vigilar</h1>
          <p class="text-steel-500">
            Todo empieza apagado. Enciende sólo lo que quieres que te interrumpa.
          </p>
        </header>

        <p
          v-if="alerts.error"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs leading-relaxed text-alert"
          data-testid="error"
        >
          {{ alerts.error }}
        </p>
        <p
          v-else-if="flash"
          role="status"
          class="rounded-lg border border-success/30 bg-success/5 px-3 py-2 font-mono text-xs text-success"
        >
          {{ flash }}
        </p>

        <p v-if="alerts.loading" class="font-mono text-[11px] text-steel-500">Cargando…</p>

        <section
          v-for="rule in Object.values(draft)"
          v-else
          :key="rule.rule_key"
          class="rounded-xl border bg-paper p-4 sm:p-5"
          :class="rule.is_enabled ? 'border-ember/30' : 'border-line'"
          :data-rule="rule.rule_key"
        >
          <header class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 gap-3">
              <span
                class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-app text-steel-500"
              >
                <i class="pi text-[13px]" :class="RULE_ICON[rule.rule_key]" />
              </span>
              <div class="min-w-0">
                <h2 class="font-display text-base font-extrabold text-ink">
                  {{ RULE_LABEL[rule.rule_key] }}
                </h2>
                <p class="mt-0.5 text-sm leading-relaxed text-steel-500">
                  {{ RULE_HINT[rule.rule_key] }}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="rule.is_enabled"
              :aria-label="RULE_LABEL[rule.rule_key]"
              data-testid="rule-toggle"
              class="relative h-6 w-11 shrink-0 rounded-full transition"
              :class="rule.is_enabled ? 'bg-success' : 'bg-steel-300'"
              @click="rule.is_enabled = !rule.is_enabled"
            >
              <span
                class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
                :class="rule.is_enabled ? 'left-[22px]' : 'left-0.5'"
              />
            </button>
          </header>

          <div v-if="rule.is_enabled" class="mt-4 flex flex-col gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <label v-if="THRESHOLD_LABEL[rule.rule_key]" class="flex flex-col gap-1.5">
                <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
                  {{ THRESHOLD_LABEL[rule.rule_key] }}
                </span>
                <input
                  v-model.number="rule.threshold"
                  type="number"
                  min="0"
                  max="23"
                  :class="inputCls"
                  data-testid="threshold"
                />
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
                  Cada cuánto insiste
                </span>
                <input
                  v-model.number="rule.remind_every_minutes"
                  type="number"
                  min="0"
                  step="5"
                  :class="inputCls"
                  data-testid="remind-every"
                />
                <span class="font-mono text-[10px] leading-relaxed text-steel-400">
                  <template v-if="!rule.remind_every_minutes">
                    En <strong>0</strong>: avisa una vez y no vuelve a insistir. Si esa alerta
                    salta cuando nadie mira la pantalla, se pierde.
                  </template>
                  <template v-else>
                    Minutos. Mientras nadie la tome, la resuelva o pulse "ya lo sé", el panel
                    vuelve a avisar cada {{ rule.remind_every_minutes }} min.
                    <template v-if="rule.remind_every_minutes < SWEEP_MINUTES">
                      <br />
                      <span class="text-warn">
                        Por debajo de {{ SWEEP_MINUTES }} min llegan igual cada
                        {{ SWEEP_MINUTES }}: el vigilante revisa a ese ritmo.
                      </span>
                    </template>
                  </template>
                </span>
              </label>

              <label
                v-if="rule.rule_key !== 'whatsapp_session_down'"
                class="flex flex-col gap-1.5"
              >
                <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
                  Colchón para volver a avisar
                </span>
                <input
                  v-model.number="rule.recovery_buffer"
                  type="number"
                  min="1"
                  step="1"
                  :class="inputCls"
                  data-testid="recovery-buffer"
                />
                <span class="font-mono text-[10px] leading-relaxed text-steel-400">
                  En {{ BUFFER_UNIT[rule.rule_key] }}. Hasta que no se recupere por encima de
                  eso, esta alerta no vuelve a sonar — es lo que impide que algo que sube y
                  baja alrededor del límite avise cuarenta veces.
                  <template v-if="rule.rule_key === 'low_stock'">
                    <br />
                    Con {{ rule.recovery_buffer || 0 }}%, un insumo de mínimo 2 se cierra al pasar
                    de {{ bufferExample(rule.recovery_buffer, 2) }}, y uno de mínimo 500, al pasar
                    de {{ bufferExample(rule.recovery_buffer, 500) }}. Es un porcentaje para que el
                    mismo número sirva midas kilos, gramos o unidades.
                  </template>
                </span>
                <span
                  v-if="bufferError(rule)"
                  role="alert"
                  class="font-mono text-[11px] leading-relaxed text-alert"
                  data-testid="buffer-error"
                >
                  {{ bufferError(rule) }}
                </span>
              </label>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="flex flex-col gap-1.5">
                <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
                  Primer WhatsApp tras (minutos)
                </span>
                <input
                  v-model.number="rule.escalation_after_minutes"
                  type="number"
                  min="1"
                  :class="inputCls"
                  data-testid="escalation-minutes"
                />
                <span class="font-mono text-[10px] leading-relaxed text-steel-400">
                  Sólo si nadie la ha tomado para entonces. Después, WhatsApp vuelve a insistir
                  cada <strong>{{ WHATSAPP_REESCALATION_HOURS }} horas</strong> —un techo de
                  {{ 24 / WHATSAPP_REESCALATION_HOURS }} mensajes al día— y ese ritmo no se
                  configura: protege al número del negocio, no a la regla. Tomarla, resolverla o
                  pulsar "ya lo sé" lo cancela.
                </span>
              </label>

              <div
                class="flex items-start justify-between gap-3 rounded-lg border border-line bg-app p-3"
              >
                <div class="min-w-0">
                  <p class="text-sm font-medium text-ink">Escalar por WhatsApp</p>
                  <p
                    class="mt-0.5 font-mono text-[10px] leading-relaxed"
                    :class="canEscalate ? 'text-steel-400' : 'text-warn'"
                    data-testid="reach"
                  >
                    {{ reachLabel ?? 'Le escribe al personal de esta sucursal que pueda ver alertas.' }}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  :aria-checked="rule.escalate_to_whatsapp"
                  aria-label="Escalar por WhatsApp"
                  :disabled="!canEscalate"
                  data-testid="escalate-toggle"
                  class="relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40"
                  :class="rule.escalate_to_whatsapp ? 'bg-success' : 'bg-steel-300'"
                  @click="rule.escalate_to_whatsapp = !rule.escalate_to_whatsapp"
                >
                  <span
                    class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
                    :class="rule.escalate_to_whatsapp ? 'left-[22px]' : 'left-0.5'"
                  />
                </button>
              </div>
            </div>
          </div>

          <footer class="mt-4 flex justify-end">
            <button
              type="button"
              :disabled="!canSave(rule) || savingKey === rule.rule_key"
              data-testid="save-rule"
              class="rounded-lg bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember-600 disabled:opacity-40"
              @click="save(rule.rule_key)"
            >
              {{ savingKey === rule.rule_key ? 'Guardando…' : 'Guardar' }}
            </button>
          </footer>
        </section>

        <p class="font-mono text-[11px] leading-relaxed text-steel-400">
          El vigilante revisa cada pocos minutos, así que una alerta puede tardar un poco en
          aparecer — pero aparece aunque nadie tenga la aplicación abierta.
        </p>
      </div>
    </main>
  </AppShell>
</template>
