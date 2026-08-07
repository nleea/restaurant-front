<script setup lang="ts">
// Consumo del asistente: cuánto se lleva gastado, cuánto queda y qué pasa si se acaba.
//
// La pantalla tiene un trabajo por encima de los demás: que **pasarse del umbral sea
// imposible de no ver**. Un número más en una fila de números no avisa a nadie; por eso el
// estado de aviso cambia la barra entera y dice qué va a pasar, no sólo cuánto queda.
//
// Y no enseña lo que nos cuesta a nosotros el proveedor: ese dato es nuestro margen.
import { computed, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useAssistantStore } from '@/stores/assistant'
import type { SaveEntitlementRequest } from '@/services/assistant.api'
import * as api from '@/services/assistant.api'
import { detailOf } from '@/lib/apiError'

const assistant = useAssistantStore()

const saving = ref(false)
const flash = ref<string | null>(null)
const formError = ref<string | null>(null)
const draft = ref<SaveEntitlementRequest>({
  plan: 'basic',
  is_enabled: false,
  monthly_quota_units: 0,
  warning_threshold_percent: 80,
  fallback_message: '',
})

const usage = computed(() => assistant.usage)

/** El estado en una palabra. Es lo que decide el color de la barra. */
const level = computed<'ok' | 'warning' | 'exhausted'>(() => {
  if (!usage.value) return 'ok'
  if (usage.value.exhausted) return 'exhausted'
  return assistant.pastThreshold ? 'warning' : 'ok'
})

const barClass = computed(() =>
  level.value === 'exhausted'
    ? 'bg-ember'
    : level.value === 'warning'
      ? 'bg-ember/70'
      : 'bg-graphite/70',
)

/** Encender sin unidades contestaría "se agotó" desde el primer mensaje: parece una avería. */
const canEnable = computed(() => draft.value.monthly_quota_units > 0)

async function save(): Promise<void> {
  saving.value = true
  flash.value = null
  formError.value = null
  try {
    assistant.usage = await api.saveEntitlement(draft.value)
    flash.value = 'Guardado.'
  } catch (error) {
    formError.value = detailOf(error) ?? 'No se pudo guardar.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([assistant.loadUsage(), assistant.loadRecent(), assistant.loadPlans()])
})

watch(usage, (value) => {
  if (!value?.entitled) return
  draft.value = {
    plan: value.plan || 'basic',
    is_enabled: value.is_enabled,
    monthly_quota_units: value.quota_units,
    warning_threshold_percent: value.warning_threshold_percent,
    fallback_message: draft.value.fallback_message,
  }
})
</script>

<template>
  <AppShell title="Consumo del asistente">
    <div class="mx-auto max-w-3xl space-y-6 p-4">
      <header>
        <h1 class="font-display text-2xl text-graphite">Consumo del asistente</h1>
        <p class="text-sm text-steel">
          Cada respuesta descuenta una unidad del saldo del periodo.
        </p>
      </header>

      <section
        v-if="usage?.entitled"
        data-test="meter"
        class="rounded border border-steel/20 bg-paper p-4"
        :data-level="level"
      >
        <div class="flex items-baseline justify-between">
          <p class="font-mono text-lg text-graphite">
            {{ usage.used_units }} / {{ usage.quota_units }}
          </p>
          <p class="font-mono text-sm text-steel">{{ usage.used_percent }}%</p>
        </div>
        <div class="mt-2 h-2 w-full rounded bg-steel/15">
          <div
            class="h-2 rounded transition-all"
            :class="barClass"
            :style="{ width: Math.min(100, usage.used_percent) + '%' }"
          />
        </div>

        <p
          v-if="level === 'exhausted'"
          data-test="exhausted"
          class="mt-3 rounded border border-ember/40 bg-ember/5 px-3 py-2 text-sm text-graphite"
        >
          <strong>Se agotó el saldo.</strong> A los clientes que escriban por WhatsApp les
          responde un mensaje fijo con el enlace de la carta — no se llama al modelo, así que
          no se gasta nada. Sus conversaciones siguen en el inbox y cualquiera puede atenderlas.
        </p>
        <p
          v-else-if="level === 'warning'"
          data-test="warning"
          class="mt-3 rounded border border-ember/40 bg-ember/5 px-3 py-2 text-sm text-graphite"
        >
          <strong>Pasaste el {{ usage.warning_threshold_percent }}%.</strong> Quedan
          {{ usage.remaining_units }} respuestas antes de que el asistente deje de contestar.
        </p>
      </section>

      <section v-else class="rounded border border-steel/30 bg-paper p-4 text-sm text-steel">
        El asistente no está contratado para este negocio.
      </section>

      <section class="space-y-3 rounded border border-steel/20 bg-paper p-4">
        <h2 class="font-display text-lg text-graphite">Plan y saldo</h2>
        <label class="block text-sm">
          <span class="text-steel">Plan</span>
          <select v-model="draft.plan" class="mt-1 w-full rounded border border-steel/30 px-2 py-1">
            <option v-for="plan in assistant.plans" :key="plan.name" :value="plan.name">
              {{ plan.name }}
            </option>
          </select>
        </label>
        <label class="block text-sm">
          <span class="text-steel">Unidades del periodo</span>
          <input
            v-model.number="draft.monthly_quota_units"
            data-test="quota"
            type="number"
            min="0"
            class="mt-1 w-full rounded border border-steel/30 px-2 py-1"
          />
        </label>
        <label class="block text-sm">
          <span class="text-steel">Avisar al llegar al (%)</span>
          <input
            v-model.number="draft.warning_threshold_percent"
            type="number"
            min="1"
            max="99"
            class="mt-1 w-full rounded border border-steel/30 px-2 py-1"
          />
          <span class="mt-1 block text-xs text-steel">
            Avisa una vez, no en cada mensaje: usa la misma histéresis que el resto de alertas.
          </span>
        </label>
        <label class="block text-sm">
          <span class="text-steel">Mensaje cuando se agote</span>
          <textarea
            v-model="draft.fallback_message"
            rows="2"
            class="mt-1 w-full rounded border border-steel/30 px-2 py-1"
            placeholder="Usa {link} para el enlace de la carta."
          />
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="draft.is_enabled" type="checkbox" :disabled="!canEnable" />
          <span :class="canEnable ? 'text-graphite' : 'text-steel'">
            Asistente activo
            <span v-if="!canEnable" class="text-xs">
              — pon unidades primero: con cero contestaría “se agotó” desde el primer mensaje.
            </span>
          </span>
        </label>

        <div class="flex items-center gap-3">
          <button
            class="rounded bg-ember px-4 py-2 text-sm text-paper disabled:opacity-50"
            :disabled="saving"
            @click="save"
          >
            Guardar
          </button>
          <span v-if="flash" class="text-sm text-steel">{{ flash }}</span>
          <span v-if="formError" data-test="form-error" class="text-sm text-ember">{{
            formError
          }}</span>
        </div>
      </section>

      <section v-if="assistant.recent.length" class="rounded border border-steel/20 bg-paper p-4">
        <h2 class="font-display text-lg text-graphite">Últimas respuestas</h2>
        <table class="mt-2 w-full text-left text-sm">
          <thead class="text-xs uppercase text-steel">
            <tr>
              <th class="py-1">Cuándo</th>
              <th>Quién preguntó</th>
              <th class="text-right">Unidades</th>
            </tr>
          </thead>
          <tbody class="font-mono">
            <tr v-for="(entry, index) in assistant.recent" :key="index" class="border-t border-steel/10">
              <td class="py-1">{{ new Date(entry.occurred_at).toLocaleString() }}</td>
              <td>{{ entry.caller_kind === 'customer' ? 'Un cliente' : 'El equipo' }}</td>
              <td class="text-right">{{ entry.billed_units }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </AppShell>
</template>
