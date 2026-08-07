<script setup lang="ts">
// El panel derecho: cabecera, hilo y respuesta.
//
// Ya sólo compone y sostiene lo que cruza los tres: el conflicto al tomar una conversación y la
// acción de usar un archivo como comprobante. Cada pieza vive en su fichero
// (`ConversationHeader`, `MessageThread` → `MessageBubble`, `MessageComposer`), que es lo que
// permite que la burbuja decida cómo se pinta un mensaje sin saber nada de permisos ni de pedidos.
import { computed, ref } from 'vue'
import type { EligibleOrder, Message, QuickReply, Thread } from '@/services/messaging.api'
import ConversationHeader from '@/components/messaging/ConversationHeader.vue'
import type { ConnectionStatus } from '@/components/messaging/ConversationHeader.vue'
import MessageThread from '@/components/messaging/MessageThread.vue'
import MessageComposer from '@/components/messaging/MessageComposer.vue'

const props = defineProps<{
  thread: Thread
  canAttend: boolean
  sending: boolean
  replyError: string | null
  claimConflictHolder: string | null
  hasClaimConflict: boolean
  connectionStatus: ConnectionStatus
  currentEmployeeId?: string | null
  /** Si este usuario puede registrar pagos (`orders.pay`). Sin ello, la acción NO se pinta. */
  canPay?: boolean
  /** Los pedidos de este contacto a los que les falta plata. Vacío = no se ofrece la acción. */
  eligibleOrders?: EligibleOrder[]
  /** Las plantillas del tenant, para el compositor. Vacío = no se pinta el selector. */
  quickReplies?: QuickReply[]
}>()

const emit = defineEmits<{
  back: []
  useAsProof: [messageId: string, orderId: string, amount: string]
  claim: []
  close: []
  reply: [body: string]
  sendFile: [file: File, caption: string]
}>()

const isClosed = computed(() => props.thread.status === 'closed')

// --- Usar un archivo como comprobante ----------------------------------------
// Sobre qué mensaje se está eligiendo pedido. Uno a la vez: dos selectores abiertos en un hilo
// invitan a pegar el mismo archivo a dos pedidos.
const proofFor = ref<string | null>(null)
const proofOrder = ref<string>('')

/** Sólo se ofrece si puede cobrar y si hay a qué pegarlo. */
const canOfferProof = computed(
  () => Boolean(props.canPay) && (props.eligibleOrders?.length ?? 0) > 0,
)

function openProof(messageId: string): void {
  proofFor.value = messageId
  proofOrder.value = props.eligibleOrders?.[0]?.order_id ?? ''
}

function confirmProof(messageId: string): void {
  const chosen = props.eligibleOrders?.find((o) => o.order_id === proofOrder.value)
  if (!chosen) return
  // El importe sale del SALDO: quien pulsa está mirando el recibo, y el saldo es la apuesta
  // correcta el 99% de las veces. Corregirlo se hace en la comanda, donde se verifica.
  emit('useAsProof', messageId, chosen.order_id, chosen.balance)
  proofFor.value = null
}

/** Un archivo se puede ofrecer si existe, no está ya usado, y hay permiso y pedidos. */
function offersProof(message: Message): boolean {
  return Boolean(message.media_url) && !message.proof_of_order && canOfferProof.value
}

function explainsNoOrders(message: Message): boolean {
  return (
    Boolean(message.media_url) &&
    !message.proof_of_order &&
    Boolean(props.canPay) &&
    !(props.eligibleOrders?.length ?? 0)
  )
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <ConversationHeader
      :thread="thread"
      :can-attend="canAttend"
      :connection-status="connectionStatus"
      :current-employee-id="currentEmployeeId"
      @back="emit('back')"
      @claim="emit('claim')"
      @close="emit('close')"
    />

    <p
      v-if="hasClaimConflict"
      role="alert"
      class="mx-4 mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 font-mono text-[11px] text-warn"
    >
      {{ claimConflictHolder ?? 'Otro empleado' }} ya la tomó.
    </p>

    <MessageThread :thread="thread">
      <template #message-actions="{ message }">
        <button
          v-if="offersProof(message) && proofFor !== message.id"
          type="button"
          class="mt-2 rounded-lg border border-line bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
          :data-use-as-proof="message.id"
          @click="openProof(message.id)"
        >
          Usar como comprobante
        </button>

        <div
          v-else-if="offersProof(message)"
          class="mt-2 flex flex-col gap-1.5"
          :data-proof-picker="message.id"
        >
          <select
            v-model="proofOrder"
            aria-label="Pedido al que pegar el comprobante"
            class="rounded-lg border border-line bg-paper px-2 py-1 font-mono text-[11px] text-ink"
          >
            <option v-for="o in eligibleOrders" :key="o.order_id" :value="o.order_id">
              {{ o.number }} · falta {{ o.balance }}
            </option>
          </select>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-lg bg-ember px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-white"
              :data-confirm-proof="message.id"
              @click="confirmProof(message.id)"
            >
              Confirmar
            </button>
            <button
              type="button"
              class="font-mono text-[10px] text-steel-400 underline"
              @click="proofFor = null"
            >
              Cancelar
            </button>
          </div>
        </div>

        <!-- Puede cobrar pero no hay a qué pegarlo: se dice por qué. Un hueco donde debería haber
             un botón se lee como que la app está rota. -->
        <p
          v-else-if="explainsNoOrders(message)"
          class="mt-2 font-mono text-[10px] text-steel-400"
          :data-no-eligible="message.id"
        >
          Este contacto no tiene pedidos por cobrar.
        </p>
      </template>
    </MessageThread>

    <MessageComposer
      :can-attend="canAttend"
      :is-closed="isClosed"
      :sending="sending"
      :error="replyError"
      :connection-status="connectionStatus"
      :quick-replies="quickReplies"
      @send="(body) => emit('reply', body)"
      @send-file="(file, caption) => emit('sendFile', file, caption)"
    />
  </div>
</template>
