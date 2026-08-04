<script setup lang="ts">
// Una alerta encendida.
//
// La tarjeta tiene un solo trabajo: que se note lo que lleva rato sin atender. Se usa el
// mismo lenguaje que las comandas y el despacho —lo que espera se calienta— porque un dueño
// que ya sabe leer una comanda vieja sabe leer esto sin que nadie se lo explique.
//
// Una alerta TOMADA no quema: ya hay alguien encima, y seguir gritando sobre ella sería
// exactamente el ruido que empuja a silenciar el módulo.
import { computed } from 'vue'
import type { Alert } from '@/services/alerts.api'
import { elapsedLabel, heatOf, RULE_ICON, RULE_LABEL } from '@/lib/alerts'

const props = defineProps<{
  alert: Alert
  /** Cómo se llama el sujeto ("Tomate"). Sin resolver, la referencia cruda. */
  subjectLabel?: string
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'acknowledge', alertId: string): void
  (e: 'mute', alertId: string): void
}>()

const heat = computed(() => heatOf(props.alert.status, props.alert.fired_at))
const taken = computed(() => props.alert.status === 'acknowledged')
/**
 * Callada, pero SIN dueño. Se pinta distinto de una tomada a propósito: "me encargo" afirma que
 * hay alguien encima y "ya lo sé" no afirma nada sobre nadie. Confundirlas haría inútil el panel.
 */
const muted = computed(() => !taken.value && props.alert.reminders_muted_at !== null)
const elapsed = computed(() => elapsedLabel(props.alert.fired_at))
</script>

<template>
  <li
    class="rounded-xl border bg-paper p-4 transition"
    :class="{
      'border-line': heat === 'none',
      'border-warn/40 ring-1 ring-warn/10': heat === 'warm',
      'border-alert/50 ring-1 ring-alert/15': heat === 'hot',
    }"
    :data-alert="alert.id"
    :data-heat="heat"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 gap-3">
        <span
          class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
          :class="taken ? 'bg-steel-100 text-steel-500' : 'bg-ember/10 text-ember-600'"
        >
          <i class="pi text-[13px]" :class="RULE_ICON[alert.rule_key]" />
        </span>
        <div class="min-w-0">
          <h3 class="truncate font-display text-base font-extrabold text-ink">
            {{ subjectLabel ?? alert.subject_ref }}
          </h3>
          <p class="font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500">
            {{ RULE_LABEL[alert.rule_key] }}
          </p>
          <p class="mt-1 font-mono text-[11px] text-steel-400" data-testid="elapsed">
            Encendida {{ elapsed }}
            <span v-if="alert.last_escalated_at" class="text-warn" data-testid="escalated">
              · avisado por WhatsApp
            </span>
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <!-- Tomada: quién la tiene, para que el segundo no repita el trabajo. -->
        <p
          v-if="taken"
          class="rounded-lg bg-app px-3 py-1.5 font-mono text-[11px] text-steel-500"
          data-testid="holder"
        >
          La tiene {{ alert.holder_name ?? 'alguien' }}
        </p>
        <template v-else>
          <!-- Silenciada: se dice que está callada y NO que la tenga nadie. -->
          <p
            v-if="muted"
            class="rounded-lg bg-app px-3 py-1.5 font-mono text-[11px] text-steel-400"
            data-testid="muted"
          >
            <i class="pi pi-bell-slash mr-1 text-[10px]" />Sin recordatorios
          </p>
          <button
            v-else
            type="button"
            :disabled="busy"
            data-testid="mute"
            aria-label="Ya lo sé: deja de recordarme sólo esta alerta"
            class="rounded-lg border border-line px-3 py-1.5 font-mono text-[11px] text-steel-500 transition hover:border-steel-300 hover:text-ink disabled:opacity-50"
            @click="emit('mute', alert.id)"
          >
            Ya lo sé
          </button>
          <button
            type="button"
            :disabled="busy"
            data-testid="acknowledge"
            class="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ember-600 disabled:opacity-50"
            @click="emit('acknowledge', alert.id)"
          >
            Me encargo
          </button>
        </template>
      </div>
    </div>
  </li>
</template>
