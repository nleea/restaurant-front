<script setup lang="ts">
// «Mi pedido»: la comanda que el cliente todavía puede corregir. Pública, sin login — el token de
// la URL es la credencial y sólo abre ESE pedido.
//
// SIGNATURE — la misma comanda de papel térmico del storefront, pero **todavía sobre el pase, con
// un lápiz al lado**: los renglones que la cocina aún no tocó se corrigen; los que ya empezaron
// quedan sellados con el motivo escrito al lado. Nada se esconde: lo que no se puede cambiar se
// ve apagado y explicado, porque un control que desaparece deja al cliente creyendo que se
// equivocó de pantalla.
//
// Lo que esta pantalla NO hace —quitar, bajar, cancelar— tiene su propio bloque al final, con una
// persona detrás. No es un permiso que falte: es otra conversación.
//
// Los veredictos vienen del servidor y se repintan con cada respuesta. La vista puede quedarse
// vieja (la plancha pudo empezar mientras estaba abierta); el servidor releé al escribir y, si
// dice que no, aquí se enseña su frase y se resincroniza con lo que hay.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { formatCOP } from '@/lib/money'
import { waitingCopy } from '@/lib/orderWaitingState'
import { ensureFontLoaded, fontStack } from '@/lib/menuAppearance'
import type { MenuAppearanceConfig } from '@/lib/menuAppearance'
import { mockPublishedConfig } from '@/mock/menuAppearance'
import type { Addon, StorefrontCategory, StorefrontProduct } from '@/lib/storefront'
import type { CartItemConfig } from '@/stores/cart'
import * as storefront from '@/services/storefront.api'
import { editMyOrder, getMyOrder, MyOrderRefused, type MyOrder } from '@/services/myOrder.api'
import { ProofUploadFailed, uploadPaymentProof } from '@/services/paymentProof.api'
import {
  draftFor,
  editDelta,
  hasChanges,
  toPayload,
  type LineDraft,
  type PendingAddition,
} from '@/lib/myOrder'
import MyOrderLine from '@/components/myorder/MyOrderLine.vue'
import DishPicker from '@/components/myorder/DishPicker.vue'
import SettleBalance from '@/components/myorder/SettleBalance.vue'
import ProductSheet from '@/components/storefront/ProductSheet.vue'

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const loading = ref(true)
const order = ref<MyOrder | null>(null)
const saving = ref(false)
// La frase del servidor cuando dice que no. Se enseña tal cual: la escribió quien tomó la
// decisión, y reescribirla aquí sería inventarse un motivo distinto del real.
const refusal = ref<string | null>(null)
const saved = ref(false)
const sendingProof = ref(false)
const proofError = ref<string | null>(null)

// Catálogo, para añadir y para cambiar de plato.
const categories = ref<StorefrontCategory[]>([])
const products = ref<StorefrontProduct[]>([])
const addons = ref<Addon[]>([])
const config = ref<MenuAppearanceConfig>(mockPublishedConfig)

// Borradores por línea + añadidos pendientes: todo local hasta que el cliente confirma.
const drafts = reactive<Record<string, LineDraft>>({})
const additions = ref<PendingAddition[]>([])
const openLine = ref<string | null>(null)

// Hojas: elegir plato (añadir o cambiar) y configurarlo.
const picking = ref<'add' | 'swap' | null>(null)
const swapTarget = ref<string | null>(null)
const configuring = ref<StorefrontProduct | null>(null)

const themeVars = computed(() => {
  const t = config.value.theme
  return {
    '--sf-primary': t.primaryColor,
    '--sf-secondary': t.secondaryColor,
    '--sf-bg': t.backgroundColor,
    '--sf-text': t.textColor,
    '--sf-accent': t.accentColor,
    '--sf-surface': `color-mix(in oklab, ${t.backgroundColor} 60%, white)`,
    '--sf-paper': `color-mix(in oklab, ${t.backgroundColor} 35%, white)`,
    '--sf-line': `color-mix(in oklab, ${t.textColor} 14%, transparent)`,
    '--sf-muted': `color-mix(in oklab, ${t.textColor} 55%, ${t.backgroundColor})`,
    backgroundColor: 'var(--sf-bg)',
    color: 'var(--sf-text)',
    fontFamily: fontStack(t.fontFamily),
  } as Record<string, string>
})

const addonPrice = (id: string) => addons.value.find((a) => a.id === id)?.price ?? 0
const productOf = (variantId: string) => products.value.find((p) => p.variantId === variantId)

const delta = computed(() =>
  order.value ? editDelta(order.value, drafts, additions.value, addonPrice) : 0,
)
const dirty = computed(() =>
  order.value ? hasChanges(order.value, drafts, additions.value) : false,
)
/** Lo que quedaría por pagar si se confirma. Es la cifra que alguien va a cobrar en la puerta. */
const projectedOutstanding = computed(() => (order.value?.outstanding ?? 0) + delta.value)
// Cómo se cobra lo que queda debiendo. Depende del metodo que el cliente eligio al pedir:
// quien puso "transferencia" no puede leer "se paga al recibir" — se quedaria sin saber que
// hacer con la diferencia, que es exactamente el agujero que deja subir el total sin decir nada.
// Esta pantalla NO cobra: el pago lo resuelve el restaurante, y decirlo es lo minimo honesto.
const PAY_ON_ARRIVAL = new Set(['cash', 'efectivo', 'card', 'tarjeta', 'datafono'])
const settlement = computed(() => {
  if (!order.value || order.value.outstanding <= 0) return null
  return PAY_ON_ARRIVAL.has((order.value.paymentMethod ?? '').toLowerCase())
    ? 'Se paga al recibir el pedido.'
    : 'Elegiste pagar por adelantado: escríbenos y te decimos cómo enviar lo que falta.'
})

// Se ofrece mandar comprobante cuando queda saldo y el método NO se cobra en la puerta. Con
// efectivo no se pide nada: se paga al recibir, como siempre.
// Lo que se le dice al cliente de un pedido que todavía debe. Compartido con la confirmación del
// checkout: escrito dos veces, en tres meses dirían cosas distintas.
const waiting = computed(() =>
  waitingCopy({
    paymentMethod: order.value?.paymentMethod ?? null,
    balance: projectedOutstanding.value,
    proofPending: Boolean(order.value?.paymentProofPending),
  }),
)

const canSettle = computed(
  () => projectedOutstanding.value > 0 && settlement.value !== null && !PAY_ON_ARRIVAL.has(
    (order.value?.paymentMethod ?? '').toLowerCase(),
  ),
)

const whatsappHref = computed(() => {
  const phone = order.value?.contactPhone?.replace(/\D/g, '')
  return phone ? `https://wa.me/${phone}` : null
})

/** Reemplaza el estado con lo que el servidor acaba de decir, y tira los borradores. */
function adopt(fresh: MyOrder): void {
  order.value = fresh
  for (const key of Object.keys(drafts)) delete drafts[key]
  for (const line of fresh.lines) drafts[line.itemId] = draftFor(line)
  additions.value = []
  openLine.value = null
}

onMounted(async () => {
  const [fresh, appearance, menu] = await Promise.all([
    getMyOrder(token.value),
    storefront.getAppearance().catch(() => mockPublishedConfig),
    storefront.getMenu().catch(() => null),
  ])
  config.value = appearance
  ensureFontLoaded(appearance.theme.fontFamily)
  if (menu) {
    categories.value = menu.categories
    products.value = menu.products
    addons.value = menu.addons
  }
  if (fresh) adopt(fresh)
  loading.value = false
})

watch(dirty, (isDirty) => {
  // Un "guardado" que sigue en pantalla mientras se toca otra cosa acaba leyéndose como si el
  // cambio nuevo también estuviera guardado.
  if (isDirty) saved.value = false
})

function patchLine(itemId: string, patch: Partial<LineDraft>): void {
  const draft = drafts[itemId]
  if (draft) Object.assign(draft, patch)
}

// Cada línea con su borrador ya emparejado. `adopt()` los crea todos, así que el respaldo no
// llega a usarse; está para que el tipo sea total y la plantilla no tenga que dudar.
const rows = computed(() =>
  (order.value?.lines ?? []).map((line) => ({ line, draft: drafts[line.itemId] ?? draftFor(line) })),
)

function onPick(product: StorefrontProduct): void {
  if (picking.value === 'swap' && swapTarget.value) {
    patchLine(swapTarget.value, { variantId: product.variantId, variantPrice: product.price })
    picking.value = null
    swapTarget.value = null
    return
  }
  picking.value = null
  configuring.value = product
}

function onConfigured(cfg: CartItemConfig): void {
  if (cfg.variantId) {
    additions.value.push({
      uid: crypto.randomUUID(),
      variantId: cfg.variantId,
      name: cfg.name,
      quantity: cfg.quantity,
      unitPrice: cfg.unitPrice,
      addonIds: cfg.addons.map((a) => a.id),
      removedIngredients: cfg.removed,
      note: cfg.note,
    })
  }
  configuring.value = null
}

async function sendProof(file: File): Promise<void> {
  if (!order.value || sendingProof.value) return
  sendingProof.value = true
  proofError.value = null
  try {
    // Se manda el SALDO, no el total: es lo que el cliente va a transferir.
    const result = await uploadPaymentProof(token.value, file, order.value.outstanding)
    adopt(result.order)
  } catch (error) {
    // Enviado ≠ pagado, y fallido ≠ enviado. Se dice, y la ruta de WhatsApp sigue ahí.
    proofError.value =
      error instanceof ProofUploadFailed ? error.message : 'No pudimos subir tu comprobante.'
  } finally {
    sendingProof.value = false
  }
}

async function confirm(): Promise<void> {
  if (!order.value || !dirty.value || saving.value) return
  saving.value = true
  refusal.value = null
  try {
    adopt(await editMyOrder(token.value, toPayload(order.value, drafts, additions.value)))
    saved.value = true
  } catch (error) {
    refusal.value =
      error instanceof MyOrderRefused ? error.message : 'No pudimos guardar el cambio.'
    // Resincronizar con la realidad: el no puede venir de que el mundo se movió (la cocina
    // empezó), y dejar en pantalla lo que el cliente escribió lo invitaría a reintentarlo.
    const fresh = await getMyOrder(token.value)
    if (fresh) adopt(fresh)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh pb-32" :style="themeVars">
    <header class="px-5 pt-8 pb-4 text-center">
      <p class="font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--sf-muted)]">Mi pedido</p>
      <h1 class="mt-1 text-xl font-bold">{{ config.brand.restaurantName }}</h1>
      <!-- El mismo hecho que la confirmación, contado con las mismas palabras: un prepago sin
           verificar está DETENIDO, no en preparación. La frase se deriva en un solo sitio. -->
      <p
        v-if="waiting.state !== 'normal'"
        class="mx-auto mt-3 max-w-xs rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-3 text-left text-[13px]"
        data-testid="waiting-state"
      >
        <span class="font-semibold">{{ waiting.label }}</span>
        <span class="mt-0.5 block text-[var(--sf-muted)]">{{ waiting.detail }}</span>
      </p>
    </header>

    <p v-if="loading" class="px-5 py-10 text-center text-[13px] text-[var(--sf-muted)]">
      Abriendo tu pedido…
    </p>

    <!-- Enlace vencido / desconocido: la misma respuesta para los dos, sin decir si el pedido
         existe. Quien llega con un enlace viejo no ha hecho nada malo. -->
    <div v-else-if="!order" class="mx-auto max-w-md px-5">
      <div class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-5 py-8 text-center">
        <i class="pi pi-link text-2xl text-[var(--sf-muted)]" />
        <h2 class="mt-3 text-base font-bold">Este enlace ya no sirve</h2>
        <p class="mt-1 text-[13px] text-[var(--sf-muted)]">
          Los enlaces para corregir un pedido caducan al poco tiempo. Si necesitas cambiar algo,
          escríbenos y lo resolvemos.
        </p>
      </div>
    </div>

    <div v-else class="mx-auto flex max-w-md flex-col gap-4 px-5">
      <!-- El pedido entero fuera de alcance: la pantalla se apaga y dice por qué -->
      <p
        v-if="!order.editable"
        class="flex items-start gap-2 rounded-xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-3 text-[13px]"
      >
        <i class="pi pi-info-circle mt-0.5 text-[var(--sf-primary)]" />
        <span>{{ order.reason }}</span>
      </p>

      <p
        v-if="refusal"
        role="alert"
        class="flex items-start gap-2 rounded-xl border border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_10%,transparent)] px-4 py-3 text-[13px]"
      >
        <i class="pi pi-exclamation-circle mt-0.5 text-[var(--sf-primary)]" />
        <span>{{ refusal }}</span>
      </p>
      <p
        v-else-if="saved"
        class="flex items-center gap-2 rounded-xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-3 text-[13px]"
      >
        <i class="pi pi-check text-[var(--sf-primary)]" /> Listo, ya lo tenemos en cuenta.
      </p>

      <!-- La comanda -->
      <div class="sf-ticket">
        <div class="sf-perf sf-perf--top" />
        <div class="bg-[var(--sf-paper)] px-5 pb-5 pt-4">
          <ul class="flex flex-col gap-4">
            <MyOrderLine
              v-for="row in rows"
              :key="row.line.itemId"
              :line="row.line"
              :draft="row.draft"
              :addons="addons"
              :available-addon-ids="productOf(row.line.variantId)?.addonIds ?? []"
              :open="openLine === row.line.itemId"
              @patch="patchLine(row.line.itemId, $event)"
              @toggle="openLine = openLine === row.line.itemId ? null : row.line.itemId"
              @swap="
                () => {
                  swapTarget = row.line.itemId
                  picking = 'swap'
                }
              "
            />
            <!-- Añadidos aún sin confirmar: se ven en la comanda, a lápiz -->
            <li
              v-for="a in additions"
              :key="a.uid"
              class="font-mono text-[13px] text-[var(--sf-primary)]"
            >
              <div class="flex items-baseline gap-2">
                <span class="tabular-nums">{{ a.quantity }}×</span>
                <span class="min-w-0 flex-1 font-sans font-semibold leading-tight">{{ a.name }}</span>
                <button
                  type="button"
                  class="shrink-0 text-[11px] uppercase tracking-wide underline-offset-2 hover:underline"
                  @click="additions = additions.filter((x) => x.uid !== a.uid)"
                >
                  Quitar
                </button>
              </div>
              <p class="pl-6 text-[11px]">sin confirmar</p>
            </li>
          </ul>

          <div class="sf-rule my-3" />
          <dl class="flex flex-col gap-1 font-mono text-[13px]">
            <div class="flex justify-between text-[var(--sf-muted)]">
              <dt>Total del pedido</dt>
              <dd class="tabular-nums">{{ formatCOP(order.total) }}</dd>
            </div>
            <div v-if="order.paid > 0" class="flex justify-between text-[var(--sf-muted)]">
              <dt>Ya pagaste</dt>
              <dd class="tabular-nums">−{{ formatCOP(order.paid) }}</dd>
            </div>
            <div
              class="mt-1 flex items-baseline justify-between border-t border-dashed border-[var(--sf-line)] pt-2"
            >
              <dt class="font-sans text-sm font-bold uppercase tracking-wide">Por pagar</dt>
              <dd class="text-lg font-bold tabular-nums text-[var(--sf-primary)]">
                {{ formatCOP(projectedOutstanding) }}
              </dd>
            </div>
          </dl>
          <!-- La barra de confirmar desaparece al guardar, y con ella la explicacion. Sin esto,
               el cliente se queda mirando un "por pagar" sin saber donde se paga. -->
          <p v-if="settlement" class="mt-2 text-[11px] text-[var(--sf-muted)]">
            {{ settlement }}
            <a
              v-if="whatsappHref && !settlement.startsWith('Se paga')"
              :href="whatsappHref"
              target="_blank"
              rel="noopener"
              class="font-semibold text-[var(--sf-primary)] underline-offset-2 hover:underline"
            >
              Escribir al restaurante
            </a>
          </p>
        </div>
        <div class="sf-perf sf-perf--bottom" />
      </div>

      <button
        v-if="order.editable"
        type="button"
        class="w-full rounded-full border border-dashed border-[var(--sf-line)] bg-[var(--sf-surface)] py-3 text-[14px] font-medium transition active:scale-[0.99]"
        @click="picking = 'add'"
      >
        <i class="pi pi-plus text-[11px]" /> Añadir algo más
      </button>

      <SettleBalance
        v-if="canSettle"
        :outstanding="projectedOutstanding"
        :pending="order.paymentProofPending"
        :whatsapp-href="whatsappHref"
        :busy="sendingProof"
        :error="proofError"
        @send="sendProof"
      />

      <!-- Lo que aquí no se hace, y con quién se hace -->
      <div class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 py-4 text-[13px]">
        <p class="font-semibold">¿Quitar algo o cancelar?</p>
        <p class="mt-1 text-[var(--sf-muted)]">
          Eso lo resuelve una persona del restaurante, no esta pantalla. Escríbenos y lo vemos.
        </p>
        <a
          v-if="whatsappHref"
          :href="whatsappHref"
          target="_blank"
          rel="noopener"
          class="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--sf-primary)] px-4 py-2 text-[13px] font-medium text-white"
        >
          <i class="pi pi-whatsapp" /> Escribirle al restaurante
        </a>
        <p v-else class="mt-2 text-[12px] text-[var(--sf-muted)]">
          Responde al mensaje donde recibiste este enlace.
        </p>
      </div>
    </div>

    <!-- Lo que se va a cobrar, antes de confirmar -->
    <div
      v-if="dirty"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--sf-line)] bg-[var(--sf-bg)] px-5 py-3"
      :style="themeVars"
    >
      <div class="mx-auto flex max-w-md items-center gap-3">
        <div class="min-w-0 flex-1">
          <!-- Corregir una nota o una exclusión no cuesta nada, y decir "+$0" invita a buscar el
               truco. Cuando no hay delta, se dice que no lo hay. -->
          <p
            v-if="delta > 0"
            class="font-mono text-[15px] font-bold tabular-nums text-[var(--sf-primary)]"
          >
            +{{ formatCOP(delta) }}
          </p>
          <p v-else class="text-[14px] font-semibold">Sin costo adicional</p>
          <p v-if="delta > 0" class="truncate text-[11px] text-[var(--sf-muted)]">
            Se suma a tu cuenta · {{ settlement ?? 'se paga al recibir el pedido' }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-full bg-[var(--sf-primary)] px-5 py-3 text-[14px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-60"
          :disabled="saving"
          @click="confirm"
        >
          {{ saving ? 'Guardando…' : 'Confirmar cambios' }}
        </button>
      </div>
    </div>

    <DishPicker
      v-if="picking"
      :title="picking === 'swap' ? 'Cambiar por…' : 'Añadir a tu pedido'"
      :products="products"
      :categories="categories"
      @pick="onPick"
      @close="
        () => {
          picking = null
          swapTarget = null
        }
      "
    />
    <ProductSheet
      v-if="configuring"
      :product="configuring"
      :editing="null"
      :addons="addons"
      :detail="config.dishDetail"
      @submit="onConfigured"
      @close="configuring = null"
    />
  </div>
</template>

<style scoped>
/* Mismo papel térmico que la comanda del storefront: cuerpo de papel entre dos bordes dentados.
   Los colores salen de las variables del tema, fijadas en la raíz de esta vista. */
.sf-ticket {
  filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.14));
}
.sf-perf {
  height: 8px;
  background: var(--sf-paper);
  -webkit-mask-size: 16px 8px;
  mask-size: 16px 8px;
  -webkit-mask-repeat: repeat-x;
  mask-repeat: repeat-x;
}
.sf-perf--top {
  -webkit-mask-image: radial-gradient(circle at 8px 0, transparent 5px, #000 5.5px);
  mask-image: radial-gradient(circle at 8px 0, transparent 5px, #000 5.5px);
}
.sf-perf--bottom {
  -webkit-mask-image: radial-gradient(circle at 8px 8px, transparent 5px, #000 5.5px);
  mask-image: radial-gradient(circle at 8px 8px, transparent 5px, #000 5.5px);
}
.sf-rule {
  border-top: 1px dashed var(--sf-line);
}
</style>
