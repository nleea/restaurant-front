<script setup lang="ts">
// El chat del panel: preguntarle al asistente por la sede en la que estás.
//
// Dos cosas que la pantalla tiene que dejar clarísimas, porque de lo contrario genera
// llamadas al soporte:
//
// 1. **No cambia nada.** Consulta y ya. Alguien que crea que puede pedirle "sube el precio
//    del corrientazo" no va a entender por qué no pasó nada, así que se dice antes de que
//    pregunte, no después.
// 2. **Por qué no contestó.** "Vuelve a intentarlo en un momento" y "se acabó el saldo" son
//    dos situaciones con dos acciones distintas; un único "algo salió mal" las esconde.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useAssistantStore } from '@/stores/assistant'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'

const assistant = useAssistantStore()
const branch = useBranchStore()
const auth = useAuthStore()

const question = ref('')
const thread = ref<HTMLElement | null>(null)

const canManage = computed(() => auth.can('assistant.manage'))

/** Qué se dice cuando no hay respuesta. Una frase por causa, con su salida. */
const refusalMessage = computed(() => {
  switch (assistant.refusal) {
    case 'rate_limited':
      return 'Demasiadas preguntas seguidas. Espera un momento y vuelve a intentarlo.'
    case 'quota_exhausted':
      return canManage.value
        ? 'Se agotó el saldo del asistente para este periodo. Puedes ampliarlo en Consumo.'
        : 'Se agotó el saldo del asistente para este periodo. Avísale a quien administra el negocio.'
    case 'not_entitled':
      return 'Este negocio todavía no tiene el asistente contratado.'
    case 'unavailable':
      return 'El asistente está fuera de servicio ahora mismo. Inténtalo más tarde.'
    default:
      return null
  }
})

async function send(): Promise<void> {
  const branchId = branch.activeBranchId
  if (!branchId) return
  const text = question.value
  question.value = ''
  await assistant.ask(text, branchId)
  await nextTick()
  // Bajar del todo es un adorno: si el entorno no lo implementa, la respuesta ya está en
  // pantalla y no puede costar el turno.
  thread.value?.scrollTo?.({ top: thread.value.scrollHeight, behavior: 'smooth' })
}

onMounted(async () => {
  await branch.ensureLoaded()
  await assistant.loadUsage()
})

// Cambiar de sede empieza otra conversación: "¿cuánto vendimos ayer?" no significa lo mismo
// en dos sitios, y arrastrar el hilo haría que la respuesta anterior pareciera de esta sede.
watch(
  () => branch.activeBranchId,
  () => assistant.clearChat(),
)
</script>

<template>
  <AppShell title="Asistente">
    <div class="mx-auto flex h-full max-w-3xl flex-col gap-4 p-4">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 class="font-display text-2xl text-graphite">Asistente</h1>
          <p class="text-sm text-steel">
            Pregunta por la carta, el stock o las ventas de
            <strong>{{ branch.activeBranch?.name ?? 'esta sede' }}</strong
            >. Contesta con lo que tú puedes ver.
          </p>
        </div>
        <RouterLink
          v-if="canManage"
          to="/assistant/usage"
          class="text-sm text-ember hover:underline"
          >Ver consumo</RouterLink
        >
      </header>

      <!-- Sólo consulta: se dice antes de preguntar, no cuando algo no pasa. -->
      <p class="rounded border border-steel/20 bg-paper px-3 py-2 text-xs text-steel">
        El asistente sólo consulta. No toma pedidos, no cambia precios y no ajusta inventario.
      </p>

      <div
        v-if="!assistant.entitled && assistant.usage"
        class="rounded border border-steel/30 bg-paper p-4 text-sm text-steel"
      >
        <p class="font-medium text-graphite">El asistente no está activo para este negocio.</p>
        <p class="mt-1">
          Se contrata por unidades de consumo.
          <RouterLink v-if="canManage" to="/assistant/usage" class="text-ember hover:underline"
            >Actívalo en Consumo</RouterLink
          ><span v-else>Habla con quien administra el negocio.</span>
        </p>
      </div>

      <template v-else>
        <div ref="thread" class="flex-1 space-y-3 overflow-y-auto" data-test="thread">
          <p v-if="!assistant.turns.length" class="py-8 text-center text-sm text-steel">
            Prueba con “¿qué se está acabando?” o “¿cuánto vendimos ayer?”.
          </p>
          <div
            v-for="(turn, index) in assistant.turns"
            :key="index"
            :class="turn.role === 'user' ? 'text-right' : 'text-left'"
          >
            <p
              class="inline-block max-w-[85%] whitespace-pre-wrap rounded px-3 py-2 text-sm"
              :class="
                turn.role === 'user' ? 'bg-graphite text-paper' : 'bg-paper text-graphite'
              "
            >
              {{ turn.text }}
            </p>
            <p v-if="turn.units" class="mt-1 font-mono text-[11px] text-steel">
              {{ turn.units }} {{ turn.units === 1 ? 'unidad' : 'unidades' }}
            </p>
          </div>
          <p v-if="assistant.asking" class="text-sm text-steel">Pensando…</p>
        </div>

        <p
          v-if="refusalMessage"
          data-test="refusal"
          class="rounded border border-ember/40 bg-ember/5 px-3 py-2 text-sm text-graphite"
        >
          {{ refusalMessage }}
        </p>
        <p v-else-if="assistant.error" class="text-sm text-ember">{{ assistant.error }}</p>

        <form class="flex gap-2" @submit.prevent="send">
          <input
            v-model="question"
            data-test="question"
            class="flex-1 rounded border border-steel/30 px-3 py-2 text-sm"
            placeholder="Escribe tu pregunta…"
            :disabled="assistant.asking"
          />
          <button
            type="submit"
            class="rounded bg-ember px-4 py-2 text-sm text-paper disabled:opacity-50"
            :disabled="assistant.asking || !question.trim()"
          >
            Preguntar
          </button>
        </form>
      </template>
    </div>
  </AppShell>
</template>
