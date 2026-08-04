import { defineStore } from 'pinia'
import { createLiveRefetch, type LiveRefetch } from '@/composables/useLiveRefetch'
import { baseURL } from '@/lib/http'
import * as api from '@/services/messaging.api'
import type { Conversation, Thread, WhatsAppSession } from '@/services/messaging.api'
import { detailOf, statusOf } from '@/lib/apiError'

/** The 409 body the backend sends when somebody else already holds a conversation. */
interface ClaimConflictBody {
  code?: string
  detail?: string
  holder_employee_id?: string | null
  holder_name?: string | null
}

// The inbox is branch-scoped end to end: the branch is not a filter over a global list, it
// is part of the address of every conversation. Switching branch is therefore a reload, not
// a re-filter — `load()` replaces both the list and any open thread.
let live: LiveRefetch | undefined

interface MessagingState {
  branchId: string | null
  conversations: Conversation[]
  thread: Thread | null
  sessions: WhatsAppSession[]
  /** QR por sesión, sólo en memoria: caduca en segundos y es de un solo uso. */
  qrBySession: Record<string, string | null>
  loading: boolean
  error: string | null
  /** Set when somebody else claimed the conversation first — shown, never swallowed. */
  claimConflict: { conversationId: string; holderName: string | null } | null
  sending: boolean
  replyError: string | null
  /** Las plantillas del tenant. Se cargan una vez por sesión de la pantalla, no por hilo. */
  quickReplies: api.QuickReply[]
  quickRepliesLoaded: boolean
}

export const useMessagingStore = defineStore('messaging', {
  state: (): MessagingState => ({
    branchId: null,
    conversations: [],
    thread: null,
    sessions: [],
    qrBySession: {},
    loading: false,
    error: null,
    claimConflict: null,
    sending: false,
    replyError: null,
    quickReplies: [],
    quickRepliesLoaded: false,
  }),

  getters: {
    /** Conversations nobody has taken yet — the queue that needs attention. */
    unclaimed: (state): Conversation[] =>
      state.conversations.filter((c) => c.employee_id === null),
    awaitingCount: (state): number =>
      state.conversations.filter((c) => c.awaiting_reply).length,
    sessionOf:
      (state) =>
      (branchId: string): WhatsAppSession | null =>
        state.sessions.find((s) => s.branch_id === branchId) ?? null,
  },

  actions: {
    async load(branchId: string): Promise<void> {
      this.branchId = branchId
      this.loading = true
      this.error = null
      try {
        this.conversations = await api.listConversations(branchId)
        // A thread from the previous branch must not survive the switch.
        if (this.thread && this.thread.branch_id !== branchId) this.thread = null
      } catch {
        this.error = 'No se pudo cargar el inbox de WhatsApp.'
      } finally {
        this.loading = false
      }
    },

    /**
     * Las plantillas del tenant, una sola vez.
     *
     * No se recarga por conversación: la lista cambia cuando el dueño la guarda, y ver una
     * plantilla vieja durante un turno no rompe nada. Un fallo deja la lista vacía —el selector
     * no se pinta— y **no** pone `error`: no poder ver las plantillas no puede tapar el
     * compositor ni impedirle a nadie responder un chat.
     */
    async loadQuickReplies(): Promise<void> {
      if (this.quickRepliesLoaded) return
      this.quickRepliesLoaded = true
      try {
        this.quickReplies = await api.getQuickReplies()
      } catch {
        this.quickReplies = []
      }
    },

    /** Doorbell refresh: the list, and the open thread with it. */
    async refetch(): Promise<void> {
      if (!this.branchId) return
      await this.refetchList()
      // Keep an open thread in step with the list on the same doorbell.
      if (this.thread) {
        this.thread = await api.getThread(this.branchId, this.thread.id)
      }
    },

    /** List only. Used after a write whose response already carried the fresh thread —
     *  re-fetching it would be a second round trip for something we just received. */
    async refetchList(): Promise<void> {
      if (!this.branchId) return
      this.conversations = await api.listConversations(this.branchId)
    },

    async openThread(conversationId: string): Promise<void> {
      if (!this.branchId) return
      this.replyError = null
      this.claimConflict = null
      this.thread = await api.getThread(this.branchId, conversationId)
    },

    closeThread(): void {
      this.thread = null
      this.claimConflict = null
      this.replyError = null
    },

    async claim(conversationId: string): Promise<boolean> {
      if (!this.branchId) return false
      this.claimConflict = null
      try {
        this.thread = await api.claimConversation(this.branchId, conversationId)
        await this.refetchList()
        return true
      } catch (e) {
        if (statusOf(e) === 409) {
          // Losing a claim is information, not a failure: say who holds it and refresh
          // the list so the conversation stops looking available.
          const body = (e as { response?: { data?: ClaimConflictBody } }).response?.data
          this.claimConflict = {
            conversationId,
            holderName: body?.holder_name ?? null,
          }
          await this.refetch()
          return false
        }
        this.error = 'No se pudo tomar la conversación.'
        return false
      }
    },

    /**
     * Manda un archivo. Mismo `sending`/`replyError` que el texto: para el composer es el mismo
     * envío, y tener dos banderas haría que el botón girase por una y el error saliera por otra.
     */
    async sendMedia(conversationId: string, file: File, caption: string): Promise<boolean> {
      if (!this.branchId) return false
      if (file.size > api.MAX_MEDIA_BYTES) {
        this.replyError = 'El archivo pesa demasiado (máximo 5 MB).'
        return false
      }
      this.sending = true
      this.replyError = null
      try {
        this.thread = await api.sendMedia(this.branchId, conversationId, file, caption)
        await this.refetchList()
        return true
      } catch (e) {
        this.replyError =
          statusOf(e) === 502
            ? 'El archivo quedó guardado pero no salió: WhatsApp no está disponible.'
            : 'No se pudo mandar el archivo.'
        return false
      } finally {
        this.sending = false
      }
    },

    async reply(conversationId: string, body: string): Promise<boolean> {
      if (!this.branchId) return false
      this.sending = true
      this.replyError = null
      try {
        this.thread = await api.sendReply(this.branchId, conversationId, body)
        await this.refetchList()
        return true
      } catch (e) {
        const status = statusOf(e)
        this.replyError =
          status === 502
            ? 'El mensaje quedó guardado pero no salió: WhatsApp no está disponible.'
            : status === 409
              ? 'No se puede escribir a este contacto todavía.'
              : 'No se pudo enviar el mensaje.'
        // The failed message is already in the thread — reload so the agent sees it.
        if (status === 502) this.thread = await api.getThread(this.branchId, conversationId)
        return false
      } finally {
        this.sending = false
      }
    },

    async close(conversationId: string): Promise<void> {
      if (!this.branchId) return
      await api.closeConversation(this.branchId, conversationId)
      this.thread = null
      await this.refetchList()
    },

    // --- Sessions ------------------------------------------------------------
    async loadSessions(): Promise<void> {
      this.loading = true
      this.error = null
      try {
        this.sessions = await api.listSessions()
      } catch {
        this.error = 'No se pudieron cargar las sesiones de WhatsApp.'
      } finally {
        this.loading = false
      }
    },

    async createSession(branchId: string, providerInstanceRef: string): Promise<void> {
      await api.createSession(branchId, providerInstanceRef)
      await this.loadSessions()
    },

    async startPairing(sessionId: string): Promise<void> {
      this.error = null
      try {
        const result = await api.startPairing(sessionId)
        // El QR sólo vive en memoria: es de un solo uso y caduca en segundos. Guardarlo
        // sería mostrar mañana un código que ya no sirve.
        this.qrBySession[sessionId] = result.qr
      } catch (e) {
        this.error =
          detailOf(e) ??
          'No se pudo pedir el QR. ¿Está corriendo el puente de WhatsApp?'
      }
      await this.loadSessions()
    },

    clearQr(sessionId: string): void {
      delete this.qrBySession[sessionId]
    },

    // --- Live inbox (SSE doorbell → debounced refetch, polling fallback) ------
    startLive(branchId: string): void {
      this.stopLive()
      live = createLiveRefetch({
        url: `${baseURL}/messaging/events?branch_id=${branchId}`,
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
