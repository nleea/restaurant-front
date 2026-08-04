<script setup lang="ts">
import { RouterLink } from 'vue-router'
// The live dupe: a perforated docket the waiter fills by tapping tiles. Its header
// carries the mesa/canal, the lines stamp in PENDIENTE, and an "Enviar a cocina"
// action fires the pending lines to the KDS (per round). The TOTAL is the largest
// figure on the screen; the ember action opens the cobro. The order + math come from
// the real orders store (server totals are authoritative).
import { computed, ref, watch } from 'vue'
import DeliveryCard from './DeliveryCard.vue'
import DupeLine from './DupeLine.vue'
import NoteSheet from './NoteSheet.vue'
import { useAuthStore } from '@/stores/auth'
import { useOrdersStore } from '@/stores/orders'
import { formatCOP } from '@/lib/money'

const props = defineProps<{
  orderId: string
  flashItemId: string | null
  sending?: boolean
  verifying?: boolean
}>()
const emit = defineEmits<{
  bump: [itemId: string, delta: number]
  remove: [itemId: string]
  cobrar: []
  send: []
  verify: []
}>()

const auth = useAuthStore()
const orders = useOrdersStore()

// Verificar un pago ES registrar un cobro, sólo que mirando un comprobante en vez de
// recibiendo la plata — por eso reusa `orders.pay` y no un permiso propio.
const canVerify = computed(() => auth.can('orders.pay'))
const needsVerification = computed(() =>
  orders.needsPaymentVerification(props.orderId),
)
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  transfer: 'transferencia',
  card: 'tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
}
const paymentMethodLabel = computed(() => {
  const method = orders.orders.find((o) => o.id === props.orderId)?.payment_method ?? ''
  return PAYMENT_METHOD_LABEL[method] ?? method
})

// Cómo va a pagar, cuando NO hay nada que verificar. Sin esto la comanda no dice nada del pago y
// quien decide mandar a cocina no distingue "eligió efectivo, cobras en la puerta" de "todavía
// no ha elegido" — dos situaciones que se ven idénticas y se deciden distinto.
const chosenMethod = computed(
  () => orders.orders.find((o) => o.id === props.orderId)?.payment_method ?? null,
)

// El comprobante que mandó el cliente, si mandó alguno. Verificar NO lo necesita —se puede
// mirar el banco en el teléfono—, así que su ausencia no bloquea nada: sólo quita la foto.
const pendingClaims = computed(() =>
  (orders.paymentClaims[props.orderId] ?? []).filter((c) => c.status === 'pending'),
)
// ¿Hay algo que MIRAR? Es distinto de "¿hay declaración?", y confundirlos es lo que escondió el
// atajo al chat: desde que existe el enlace de pago del domicilio, el cliente puede pulsar "Ya
// pagué" sin adjuntar nada —porque el enlace mismo le ofrece mandarlo por WhatsApp, que es la
// ruta que la gente usa— y eso crea una declaración SIN comprobante. Con la condición vieja el
// cajero se quedaba con una cifra sin imagen y sin camino a la conversación donde sí está.
const hasReceiptToLookAt = computed(() => pendingClaims.value.some((c) => c.proof_url))
watch(
  needsVerification,
  (needs) => {
    if (needs) void orders.fetchPaymentClaims(props.orderId)
  },
  { immediate: true },
)

// Rechazar exige motivo, así que abre un campo en vez de disparar directo.
const rejecting = ref<string | null>(null)
const rejectReason = ref('')
const rejectError = ref<string | null>(null)

async function confirmReject(claimId: string): Promise<void> {
  const employeeId = orders.currentEmployee?.id
  if (!employeeId || !rejectReason.value.trim()) return
  rejectError.value = null
  try {
    await orders.rejectPaymentClaim(props.orderId, claimId, rejectReason.value.trim(), employeeId)
    rejecting.value = null
    rejectReason.value = ''
  } catch {
    rejectError.value = 'No se pudo rechazar el comprobante.'
  }
}

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: 'Mesa',
  takeaway: 'Para llevar',
  delivery: 'Domicilio',
}

const order = computed(() => orders.orders.find((o) => o.id === props.orderId) ?? null)
const isOpen = computed(() => order.value?.status === 'open')
const editable = computed(() => auth.can('orders.update') && isOpen.value)

const tableNumber = computed(() => {
  const id = order.value?.dining_table_id
  if (!id) return null
  return orders.tables.find((t) => t.id === id)?.number ?? null
})
const heading = computed(() => {
  const o = order.value
  if (!o) return ''
  if (o.channel === 'dine_in') return tableNumber.value ? `Mesa ${tableNumber.value}` : 'Mesa'
  return CHANNEL_LABEL[o.channel] ?? o.channel
})

const isDelivery = computed(() => order.value?.channel === 'delivery')

const paymentIntent = computed<{ label: string; hint: string } | null>(() => {
  if (needsVerification.value) return null // el bloque de verificación ya lo cuenta
  if (chosenMethod.value === 'cash') {
    return {
      label: 'Paga en efectivo al recibir',
      hint: 'El domiciliario cobra en la puerta. Puedes mandarlo a cocina.',
    }
  }
  // Un domicilio nace SIN método: el cliente lo elige desde el enlace de pago que le llega por
  // WhatsApp. Decirlo evita que se lea como "ya está resuelto".
  if (chosenMethod.value === null && isDelivery.value) {
    return {
      label: 'Aún no ha elegido cómo pagar',
      hint: 'Lo elige desde el enlace de pago que le llegó por WhatsApp.',
    }
  }
  return null
})

const items = computed(() => orders.itemsOf(props.orderId))
const rows = computed(() =>
  items.value.map((it) => ({
    id: it.id,
    name: orders.itemLabel(it),
    unitPrice: Number(it.unit_price),
    qty: it.quantity,
    lineTotal: Number(it.line_subtotal),
    sent: it.sent,
    note: it.notes,
  })),
)
const itemCount = computed(() => items.value.reduce((s, it) => s + it.quantity, 0))
const isEmpty = computed(() => items.value.length === 0)

// At least one line still pending → the kitchen hasn't seen the latest round yet.
const pendingCount = computed(() => items.value.filter((it) => !it.sent).length)
const hasPending = computed(() => pendingCount.value > 0)

// --- Kitchen note editor -----------------------------------------------------------------
// The line being annotated; null closes the sheet. Held by id so the sheet keeps tracking
// the row if the dupe refreshes underneath it.
const noteItemId = ref<string | null>(null)
const savingNote = ref(false)
const noteError = ref<string | null>(null)
const noteRow = computed(() => rows.value.find((r) => r.id === noteItemId.value) ?? null)

function openNote(itemId: string) {
  noteError.value = null
  noteItemId.value = itemId
}
async function saveNote(note: string | null) {
  const id = noteItemId.value
  if (!id) return
  savingNote.value = true
  noteError.value = null
  try {
    await orders.setItemNotes(props.orderId, id, note)
    noteItemId.value = null // saved → the sheet gets out of the way
  } catch {
    noteError.value = 'No se pudo guardar la nota.'
  } finally {
    savingNote.value = false
  }
}

const subtotal = computed(() => Number(order.value?.subtotal ?? 0))
const discount = computed(() => Number(order.value?.discount ?? 0))
const total = computed(() => Number(order.value?.total ?? 0))
// El contacto de WhatsApp del pedido. Con él la bandeja abre SU hilo en vez de dejarte buscándolo:
// un pedido sabe de qué contacto es, no de qué conversación (los hilos se abren y cierran solos).
const whatsappContactId = computed(() => order.value?.whatsapp_contact_id ?? null)
const paid = computed(() => orders.paidOf(props.orderId))
const balance = computed(() => orders.balanceOf(props.orderId))
const isSettled = computed(() => total.value > 0 && balance.value <= 0)
</script>

<template>
  <section class="card flex max-h-full flex-col overflow-hidden">
    <div class="docket-perf h-[7px] w-full shrink-0" />

    <!-- Header -->
    <header class="flex items-center justify-between gap-3 px-4 pb-3 pt-3">
      <div>
        <p class="eyebrow">Comanda</p>
        <p class="font-display text-lg font-bold text-ink">{{ heading }}</p>
      </div>
      <span v-if="isEmpty" class="pill pill-neutral">
        <i class="pi pi-desktop text-[10px]" /> comanda
      </span>
      <span v-else-if="hasPending" class="pill pill-warn">
        <i class="pi pi-clock text-[10px]" /> {{ pendingCount }} por enviar
      </span>
      <span v-else class="pill pill-neutral">
        <i class="pi pi-desktop text-[10px]" /> en cocina
      </span>
    </header>

    <div class="mx-4 border-t border-dashed border-line" />

    <!-- Where it goes. Part of the docket's identity for a delivery, not a side detail. -->
    <DeliveryCard v-if="isDelivery" :order-id="orderId" class="shrink-0 pt-2" />

    <!-- Lines (scrolls) -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4">
      <ul v-if="!isEmpty" class="divide-y divide-hairline">
        <DupeLine
          v-for="l in rows"
          :key="l.id"
          :line="l"
          :flash="l.id === flashItemId"
          :editable="editable"
          @bump="(d) => emit('bump', l.id, d)"
          @remove="emit('remove', l.id)"
          @note="openNote(l.id)"
        />
      </ul>

      <!-- Empty state: an invitation, not a dead end -->
      <div v-else class="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <i class="pi pi-arrow-left text-lg text-steel-300" aria-hidden="true" />
        <p class="text-sm font-medium text-ink">Toca un plato para empezar la comanda</p>
        <p class="font-mono text-[11px] text-steel-400">Arma la comanda y envíala a cocina cuando esté lista.</p>
      </div>
    </div>

    <!-- Totals + primary action -->
    <div class="shrink-0 border-t border-line bg-paper px-4 pb-4 pt-3">
      <dl class="flex flex-col gap-1">
        <div class="flex items-center justify-between text-[13px] text-steel-500">
          <dt>Subtotal <span class="font-mono text-[11px] text-steel-400">· {{ itemCount }} ítems</span></dt>
          <dd class="font-mono tabular-nums">{{ formatCOP(subtotal) }}</dd>
        </div>
        <div v-if="discount > 0" class="flex items-center justify-between text-[13px] text-steel-500">
          <dt>Descuento</dt>
          <dd class="font-mono tabular-nums">−{{ formatCOP(discount) }}</dd>
        </div>
        <div v-if="paid > 0" class="flex items-center justify-between text-[13px]">
          <dt class="text-steel-500">Abonado</dt>
          <dd class="font-mono tabular-nums text-success-600">−{{ formatCOP(paid) }}</dd>
        </div>
        <div class="mt-1 flex items-end justify-between border-t border-dashed border-line pt-2">
          <dt class="font-display text-sm font-semibold uppercase tracking-wide text-steel-500">
            {{ paid > 0 && !isSettled ? 'Saldo' : 'Total' }}
          </dt>
          <dd
            class="font-display text-3xl font-extrabold tabular-nums"
            :class="paid > 0 && !isSettled ? 'text-ember' : 'text-ink'"
          >
            {{ formatCOP(paid > 0 && !isSettled ? balance : total) }}
          </dd>
        </div>
      </dl>

      <div class="mt-3 flex flex-col gap-2">
        <!-- Cómo va a pagar, cuando no hay nada que verificar. ANTES de la cadena
             verificación/cocina y NUNCA dentro: un `v-if` aquí en medio rompe el `v-else-if` del
             botón de cocina, que pasa a encadenarse con éste y aparece en un prepago sin
             confirmar — justo lo que la cadena existe para impedir. -->
        <div
          v-if="editable && paymentIntent"
          class="rounded-xl border border-line bg-sunken/40 px-3 py-2.5"
          data-payment-intent
        >
          <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500">
            {{ paymentIntent.label }}
          </p>
          <p class="mt-0.5 text-xs text-muted">{{ paymentIntent.hint }}</p>
        </div>

        <!-- Prepago sin confirmar: no se cocina para un dinero que nadie ha verificado. El
             botón de cocina se reemplaza por la verificación en vez de deshabilitarse, para
             que quede claro QUÉ falta y no parezca que la app está rota. -->
        <div
          v-if="editable && needsVerification"
          class="rounded-xl border border-warn/40 bg-warn/5 p-3"
          data-verify-block
        >
          <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-warn">
            Pago por confirmar
          </p>
          <p class="mt-1 text-[13px] text-muted">
            El cliente dijo que pagó por <span class="font-medium text-ink">{{ paymentMethodLabel }}</span
            >. Revisa el comprobante por
            <span class="font-medium text-ink">{{ formatCOP(total) }}</span> antes de cocinar.
          </p>

          <!-- Sin NINGÚN comprobante adjunto, lo más probable es que lo haya mandado por
               WhatsApp: el banco ofrece "compartir por WhatsApp" justo cuando acaba de pagar, y
               el enlace de pago del domicilio se lo propone explícitamente. Un "ya pagué" pelado
               es exactamente esa señal — hay que ir a comprobar si es verdad.
               El enlace va a la BANDEJA, no a WhatsApp: ahí la imagen ya está guardada, funciona
               en cualquier dispositivo y no hace falta la sesión de la sede en este navegador. -->
          <RouterLink
            v-if="!hasReceiptToLookAt && whatsappContactId"
            :to="{ name: 'whatsapp-inbox', query: { contact: whatsappContactId } }"
            class="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
            data-open-inbox
          >
            <i class="pi pi-whatsapp text-[11px]" /> Buscarlo en WhatsApp
          </RouterLink>

          <!-- Lo que el cliente mandó. Verificar sigue siendo mirar que la plata LLEGÓ: esto
               es la ayuda para decidir, no la decisión. -->
          <div
            v-for="claim in pendingClaims"
            :key="claim.id"
            class="mt-2.5 rounded-lg border border-line bg-paper p-2.5"
            data-payment-claim
          >
            <div class="flex items-center gap-2.5">
              <a
                v-if="claim.proof_url"
                :href="claim.proof_url"
                target="_blank"
                rel="noopener"
                class="size-14 shrink-0 overflow-hidden rounded-md border border-line"
                title="Abrir el comprobante"
              >
                <img :src="claim.proof_url" alt="Comprobante enviado por el cliente" class="size-full object-cover" />
              </a>
              <div class="min-w-0 flex-1">
                <p class="font-mono text-[13px] font-bold tabular-nums text-ink">
                  {{ formatCOP(Number(claim.amount)) }}
                </p>
                <p class="text-[11px] text-muted">
                  Enviado por el cliente{{ claim.created_at ? ` · ${claim.created_at.slice(11, 16)}` : '' }}
                </p>
              </div>
              <button
                v-if="canVerify && rejecting !== claim.id"
                type="button"
                class="shrink-0 font-mono text-[10px] uppercase tracking-wide text-steel-500 underline-offset-2 hover:text-ink hover:underline"
                data-reject-claim
                @click="rejecting = claim.id"
              >
                No sirve
              </button>
            </div>
            <div v-if="rejecting === claim.id" class="mt-2 flex flex-col gap-1.5">
              <input
                v-model="rejectReason"
                type="text"
                maxlength="255"
                placeholder="¿Por qué? El cliente lo va a leer"
                class="w-full rounded-md border border-line px-2.5 py-1.5 text-[13px]"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-md bg-graphite-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                  :disabled="!rejectReason.trim()"
                  data-reject-confirm
                  @click="confirmReject(claim.id)"
                >
                  Rechazar
                </button>
                <button
                  type="button"
                  class="px-2 text-[12px] text-muted"
                  @click="rejecting = null"
                >
                  Cancelar
                </button>
              </div>
              <p v-if="rejectError" class="text-[11px] text-warn">{{ rejectError }}</p>
            </div>
          </div>
          <button
            v-if="canVerify"
            type="button"
            :disabled="verifying"
            class="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ember text-sm font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 disabled:opacity-50"
            data-verify
            @click="emit('verify')"
          >
            <i class="pi text-sm" :class="verifying ? 'pi-spin pi-spinner' : 'pi-check-circle'" />
            El pago está bien · enviar a cocina
          </button>
          <p v-else class="mt-2 font-mono text-[10px] uppercase tracking-wide text-steel-500">
            Sin permiso para confirmar pagos
          </p>
        </div>

        <!-- Enviar a cocina: routes the pending lines to the KDS. Idempotent → works per round. -->
        <button
          v-else-if="editable"
          type="button"
          :disabled="!hasPending || sending"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-semibold text-ink transition hover:border-ember/50 hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40 disabled:cursor-not-allowed disabled:opacity-40"
          @click="emit('send')"
        >
          <i class="pi text-sm" :class="sending ? 'pi-spin pi-spinner' : 'pi-send'" />
          <span v-if="hasPending">Enviar a cocina · {{ pendingCount }}</span>
          <span v-else class="flex items-center gap-1.5 text-steel-500"><i class="pi pi-check text-xs" /> Todo en cocina</span>
        </button>

        <button
          type="button"
          :disabled="isEmpty"
          class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ember text-base font-bold text-white transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 disabled:cursor-not-allowed disabled:opacity-40"
          @click="emit('cobrar')"
        >
          <span v-if="isSettled" class="flex items-center gap-2"><i class="pi pi-check-circle text-sm" /> Cuenta saldada · cerrar</span>
          <span v-else class="flex items-center gap-2"><i class="pi pi-wallet text-sm" /> Cobrar</span>
        </button>
      </div>
    </div>

    <NoteSheet
      v-if="noteRow"
      :item-name="noteRow.name"
      :note="noteRow.note"
      :saving="savingNote"
      :error="noteError"
      @save="saveNote"
      @close="noteItemId = null"
    />
  </section>
</template>
