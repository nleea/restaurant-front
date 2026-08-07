import { defineStore } from 'pinia'
import { createLiveRefetch, type LiveRefetch } from '@/composables/useLiveRefetch'
import { baseURL } from '@/lib/http'
import { detailOf, statusOf } from '@/lib/apiError'
import * as api from '@/services/alerts.api'
import type { Alert, AlertRule, EscalationReach } from '@/services/alerts.api'

// Lo que está encendido en la sucursal activa.
//
// El store vive fuera de la pantalla porque el INDICADOR del riel lo necesita: una alerta
// que sólo se ve entrando al panel no sirve de nada — el módulo entero existe para avisar a
// quien no está mirando. Por eso lo arranca el AppShell, no la vista.
let live: LiveRefetch | undefined

interface AlertsState {
  branchId: string | null
  alerts: Alert[]
  rules: AlertRule[]
  /** A cuánta gente llegaría un escalado ahora; `null` mientras no se sepa. */
  reach: EscalationReach | null
  loading: boolean
  error: string | null
  /** Perdimos la carrera: alguien la tomó primero. Se enseña, nunca se traga. */
  claimConflict: { alertId: string; message: string } | null
}

export const useAlertsStore = defineStore('alerts', {
  state: (): AlertsState => ({
    branchId: null,
    alerts: [],
    rules: [],
    reach: null,
    loading: false,
    error: null,
    claimConflict: null,
  }),

  getters: {
    /** Las que nadie ha tomado — la cuenta del indicador. */
    unacknowledged: (state): Alert[] => state.alerts.filter((a) => a.status === 'fired'),
    unacknowledgedCount(): number {
      return this.unacknowledged.length
    },
    /**
     * "Todo en orden" sólo cuando de verdad lo sabemos.
     *
     * Hay que distinguirlo de "aún no ha cargado" y —lo que de verdad importa— de "la carga
     * falló". Una lista vacía porque el servidor no contestó NO es calma: anunciarla sería
     * lo peor que puede hacer una pantalla de alertas, porque el usuario se va tranquilo.
     */
    allClear: (state): boolean =>
      !state.loading && state.error === null && state.alerts.length === 0,
  },

  actions: {
    async load(branchId: string): Promise<void> {
      this.branchId = branchId
      this.loading = true
      this.error = null
      try {
        this.alerts = await api.listAlerts(branchId)
      } catch {
        this.error = 'No se pudieron cargar las alertas.'
      } finally {
        this.loading = false
      }
    },

    /** Refresco del timbre: la lista, sin tocar el estado de carga ni los errores. */
    async refetch(): Promise<void> {
      if (!this.branchId) return
      this.alerts = await api.listAlerts(this.branchId)
    },

    async acknowledge(alertId: string): Promise<boolean> {
      if (!this.branchId) return false
      this.claimConflict = null
      try {
        const updated = await api.acknowledgeAlert(this.branchId, alertId)
        const index = this.alerts.findIndex((a) => a.id === alertId)
        if (index !== -1) this.alerts[index] = updated
        return true
      } catch (e) {
        if (statusOf(e) === 409) {
          // Perder la carrera es información, no un fallo: decir quién la tiene es lo que
          // evita que dos personas hagan el mismo trabajo. Se refresca para que la lista
          // deje de mostrarla como libre.
          this.claimConflict = {
            alertId,
            message: detailOf(e) ?? 'Otra persona ya tomó esta alerta.',
          }
          await this.refetch()
          return false
        }
        this.error = detailOf(e) ?? 'No se pudo tomar la alerta.'
        return false
      }
    },

    /**
     * Callarla sin tomarla. La tercera salida.
     *
     * No hay carrera que perder aquí —silenciar es idempotente y no reclama nada— así que no
     * hay 409 que tratar: o se calla, o el servidor dice por qué no.
     */
    async mute(alertId: string): Promise<boolean> {
      if (!this.branchId) return false
      try {
        const updated = await api.muteAlert(this.branchId, alertId)
        const index = this.alerts.findIndex((a) => a.id === alertId)
        if (index !== -1) this.alerts[index] = updated
        return true
      } catch (e) {
        this.error = detailOf(e) ?? 'No se pudo silenciar la alerta.'
        return false
      }
    },

    // --- Reglas --------------------------------------------------------------
    async loadRules(branchId: string): Promise<void> {
      this.branchId = branchId
      this.loading = true
      this.error = null
      try {
        this.rules = await api.listRules(branchId)
      } catch {
        this.error = 'No se pudo cargar la configuración de las alertas.'
      } finally {
        this.loading = false
      }
      // Best-effort: sin el diagnóstico la pantalla funciona, sólo no puede avisar de que
      // el escalado no llegaría a nadie.
      this.reach = await api.getEscalationReach(branchId).catch(() => null)
    },

    async saveRule(rule: AlertRule): Promise<boolean> {
      if (!this.branchId) return false
      this.error = null
      try {
        const saved = await api.saveRule(this.branchId, rule)
        const index = this.rules.findIndex((r) => r.rule_key === saved.rule_key)
        if (index !== -1) this.rules[index] = saved
        return true
      } catch (e) {
        // El backend rechaza el colchón cero por su cuenta; repetir su mensaje explica POR
        // QUÉ mejor que un "no se pudo guardar".
        this.error = detailOf(e) ?? 'No se pudo guardar la regla.'
        return false
      }
    },

    // --- Timbre en vivo (SSE → refetch, con sondeo de reserva) ---------------
    startLive(branchId: string): void {
      this.stopLive()
      live = createLiveRefetch({
        url: `${baseURL}/alerts/events?branch_id=${branchId}`,
        onDoorbell: async () => {
          await this.refetch()
        },
      })
      live.start()
    },
    stopLive(): void {
      live?.stop()
      live = undefined
    },
  },
})
