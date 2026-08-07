import { defineStore } from 'pinia'
import { detailOf, statusOf } from '@/lib/apiError'
import * as api from '@/services/assistant.api'
import type { AssistantPlan, AssistantUsage, UsageEntry } from '@/services/assistant.api'

// El chat del panel y lo que cuesta.
//
// Lo que más trabajo hace aquí es distinguir tres "no" que se parecen y no lo son: vuelve a
// intentarlo (límite por minuto), se acabó lo comprado (cuota) y esto no está contratado
// (sin derecho). Un solo "algo salió mal" para los tres deja al dueño sin saber si tiene que
// esperar un minuto, comprar más o no tocar nada.

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  /** Lo que costó esta respuesta, para que el gasto se vea en el momento y no en la factura. */
  units?: number
}

/** Por qué no hay respuesta. Cada uno lleva a una acción distinta. */
export type Refusal = 'rate_limited' | 'quota_exhausted' | 'not_entitled' | 'unavailable' | null

interface AssistantState {
  turns: ChatTurn[]
  asking: boolean
  refusal: Refusal
  error: string | null
  usage: AssistantUsage | null
  recent: UsageEntry[]
  plans: AssistantPlan[]
  loadingUsage: boolean
}

/** El `code` que manda el backend → el motivo que la pantalla sabe explicar. */
const REFUSAL_BY_CODE: Record<string, Refusal> = {
  assistant_rate_limited: 'rate_limited',
  assistant_quota_exhausted: 'quota_exhausted',
  assistant_not_entitled: 'not_entitled',
  assistant_disabled: 'unavailable',
  assistant_provider_error: 'unavailable',
}

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const data = (error as { response?: { data?: { code?: unknown } } }).response?.data
    if (typeof data?.code === 'string') return data.code
  }
  return undefined
}

export const useAssistantStore = defineStore('assistant', {
  state: (): AssistantState => ({
    turns: [],
    asking: false,
    refusal: null,
    error: null,
    usage: null,
    recent: [],
    plans: [],
    loadingUsage: false,
  }),

  getters: {
    /** Sin derecho la pantalla se explica, no se rompe: no es un error del que mira. */
    entitled: (state): boolean => state.usage?.entitled === true && state.usage.is_enabled,
    /** Pasado el umbral. Lo pinta la pantalla de consumo de forma inconfundible. */
    pastThreshold(): boolean {
      const usage = this.usage
      if (!usage || usage.quota_units <= 0) return false
      return usage.used_percent >= usage.warning_threshold_percent
    },
  },

  actions: {
    async ask(question: string, branchId: string): Promise<void> {
      const text = question.trim()
      if (!text || this.asking) return

      this.turns.push({ role: 'user', text })
      this.asking = true
      this.refusal = null
      this.error = null
      try {
        const answer = await api.ask(text, branchId)
        this.turns.push({ role: 'assistant', text: answer.text, units: answer.billed_units })
        // El saldo cambió: se refresca sin bloquear la conversación.
        void this.loadUsage()
      } catch (error) {
        const refusal = REFUSAL_BY_CODE[codeOf(error) ?? '']
        if (refusal) {
          this.refusal = refusal
        } else if (statusOf(error) === 403) {
          this.refusal = 'not_entitled'
        } else {
          this.error = detailOf(error) ?? 'No se pudo preguntar al asistente.'
        }
      } finally {
        this.asking = false
      }
    },

    async loadUsage(): Promise<void> {
      this.loadingUsage = true
      try {
        this.usage = await api.getUsage()
      } catch (error) {
        // Un 403 aquí no es una avería: es que quien mira no administra el asistente.
        if (statusOf(error) !== 403) {
          this.error = detailOf(error) ?? 'No se pudo leer el consumo.'
        }
      } finally {
        this.loadingUsage = false
      }
    },

    async loadRecent(): Promise<void> {
      try {
        this.recent = await api.listRecentUsage()
      } catch (error) {
        this.error = detailOf(error) ?? 'No se pudo leer el detalle de consumo.'
      }
    },

    async loadPlans(): Promise<void> {
      try {
        this.plans = await api.listPlans()
      } catch {
        this.plans = []
      }
    },

    clearChat(): void {
      this.turns = []
      this.refusal = null
      this.error = null
    },
  },
})
