<script setup lang="ts">
// Shared WhatsApp inbox for the active branch. Master–detail like the rest of the app:
// under `lg` the list fills the screen and a conversation drills in; above it, both panes.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import ConversationList from '@/components/messaging/ConversationList.vue'
import ConversationThread from '@/components/messaging/ConversationThread.vue'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'
import { useMessagingStore } from '@/stores/messaging'
import { useOrdersStore } from '@/stores/orders'
import type { ConnectionStatus } from '@/components/messaging/ConversationHeader.vue'
import {
  getEligibleOrders,
  useMessageAsProof,
  type Conversation,
  type EligibleOrder,
} from '@/services/messaging.api'

const route = useRoute()
const auth = useAuthStore()
const branch = useBranchStore()
const messaging = useMessagingStore()
// Sólo para saber QUIÉN está mirando: separa "mías" de "de otros" en la lista y decide si el
// botón dice "Tomar" o "Reasignar a mí".
const orders = useOrdersStore()

const canAttend = computed(() => auth.can('messaging.attend'))

/**
 * El estado del número, traducido a lo que la pantalla necesita saber: si lo que el agente
 * escriba va a salir o no.
 *
 * `qr_pending` cuenta como "reconectando" y no como "conectado": hay un QR esperando a que
 * alguien lo escanee, así que los mensajes no están saliendo — pero tampoco está roto del todo.
 * `banned` es lo peor que puede pasarle a un número y se cuenta como desconectado, que es lo que
 * es de cara a poder responder.
 */
const connectionStatus = computed<ConnectionStatus>(() => {
  const session = branch.activeBranchId ? messaging.sessionOf(branch.activeBranchId) : null
  if (!session) return 'disconnected'
  if (session.status === 'connected') return 'connected'
  return session.status === 'qr_pending' ? 'reconnecting' : 'disconnected'
})
// Pegar un comprobante a un pedido es dinero, no atención: se pide el permiso de cobrar. El
// backend lo exige igual; esto es para no pintar un botón que va a dar 403.
const canPay = computed(() => auth.can('orders.pay'))

/** Los pedidos de este contacto a los que les falta plata. Se cargan al abrir el hilo. */
const eligibleOrders = ref<EligibleOrder[]>([])

watch(
  () => messaging.thread?.id,
  async (id) => {
    eligibleOrders.value = []
    if (!id || !canPay.value || !branch.activeBranchId) return
    try {
      eligibleOrders.value = await getEligibleOrders(id, branch.activeBranchId)
    } catch {
      // Sin la lista no se ofrece la acción, y ya está: es una ayuda, no el hilo.
      eligibleOrders.value = []
    }
  },
  { immediate: true },
)

async function useAsProof(messageId: string, orderId: string, amount: string): Promise<void> {
  const thread = messaging.thread
  if (!thread || !branch.activeBranchId) return
  await useMessageAsProof(thread.id, messageId, branch.activeBranchId, orderId, amount)
  // El pedido deja de deber, así que deja de ser elegible: se relee en vez de adivinar.
  eligibleOrders.value = await getEligibleOrders(thread.id, branch.activeBranchId)
}

async function load() {
  await branch.ensureLoaded()
  const branchId = branch.activeBranchId
  if (!branchId) return
  await Promise.all([messaging.load(branchId), messaging.loadSessions(), orders.resolveEmployee()])
  messaging.startLive(branchId)
  await openRequestedThread()
}

/**
 * Abre el hilo que pide la URL (`?contact=<id>`), si lo hay.
 *
 * Se direcciona por CONTACTO y no por conversación porque quien enlaza aquí es la comanda, y un
 * pedido sabe de qué contacto es —no de qué hilo—. Los hilos se abren y se cierran por la ventana
 * de inactividad; el contacto es el mismo siempre.
 */
async function openRequestedThread(): Promise<void> {
  const contactId = route.query.contact
  if (typeof contactId !== 'string' || !contactId) return
  const match = messaging.conversations.find((c) => c.contact_id === contactId)
  if (match) await messaging.openThread(match.id)
}

// Las plantillas se piden una sola vez por sesión de la pantalla, no por conversación: cambian
// cuando el dueño las guarda, y ver una vieja durante un turno no rompe nada. Sin `await` en el
// mismo hilo que `load`: el inbox no puede esperar a un endpoint que sólo pinta un botón.
onMounted(() => {
  load()
  messaging.loadQuickReplies()
})
onBeforeUnmount(() => messaging.stopLive())

// Switching branch switches the inbox: a conversation belongs to the number it arrived at.
watch(
  () => branch.activeBranchId,
  () => {
    messaging.stopLive()
    messaging.closeThread()
    void load()
  },
)

function select(conversation: Conversation) {
  void messaging.openThread(conversation.id)
}
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · WhatsApp
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Inbox</h1>
          <p class="text-steel-500">
            Conversaciones de {{ branch.activeBranch?.name ?? 'la sucursal activa' }}.
            <span v-if="messaging.awaitingCount" class="text-ember-600">
              {{ messaging.awaitingCount }} esperando respuesta.
            </span>
          </p>
        </header>

        <p
          v-if="messaging.error"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ messaging.error }}
        </p>
        <p
          v-else-if="!branch.hasActiveBranch"
          class="rounded-lg border border-line bg-paper px-3.5 py-2 font-mono text-[11px] text-steel-500"
        >
          Esta cuenta aún no tiene sucursales.
        </p>

        <div class="lg:grid lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-6">
          <div :class="messaging.thread ? 'max-lg:hidden' : ''">
            <ConversationList
              :conversations="messaging.conversations"
              :selected-id="messaging.thread?.id ?? null"
              :loading="messaging.loading"
              :current-employee-id="orders.currentEmployee?.id ?? null"
              @select="select"
            />
          </div>

          <section
            class="rounded-xl border border-line bg-paper lg:h-[calc(100vh-16rem)]"
            :class="messaging.thread ? '' : 'max-lg:hidden'"
          >
            <div
              v-if="!messaging.thread"
              class="grid h-48 place-items-center px-6 text-center text-sm text-steel-500 lg:h-full"
            >
              Elige una conversación para leerla.
            </div>
            <ConversationThread
              v-else
              :key="messaging.thread.id"
              :thread="messaging.thread"
              :can-attend="canAttend"
              :connection-status="connectionStatus"
              :current-employee-id="orders.currentEmployee?.id ?? null"
              :sending="messaging.sending"
              :reply-error="messaging.replyError"
              :has-claim-conflict="messaging.claimConflict?.conversationId === messaging.thread.id"
              :claim-conflict-holder="messaging.claimConflict?.holderName ?? null"
              :can-pay="canPay"
              :eligible-orders="eligibleOrders"
              :quick-replies="messaging.quickReplies"
              @back="messaging.closeThread()"
              @claim="messaging.claim(messaging.thread!.id)"
              @close="messaging.close(messaging.thread!.id)"
              @reply="(body) => messaging.reply(messaging.thread!.id, body)"
              @use-as-proof="useAsProof"
              @send-file="(file, caption) => messaging.sendMedia(messaging.thread!.id, file, caption)"
            />
          </section>
        </div>
      </div>
    </main>
  </AppShell>
</template>
