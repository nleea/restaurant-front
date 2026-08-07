<script setup lang="ts">
// Pedir desde la mesa escaneando su QR. Pública, sin sesión y sin mesero: quien confirma es el
// comensal, y confirmar manda la comanda a cocina en el acto.
//
// La pantalla no cambia de sitio en toda la comida. Se entra por el QR, se pide, y la MISMA
// pantalla pasa a ser "mi pedido" — con lo que hay, lo que cuesta y lo que ya no se puede tocar
// porque la estación lo empezó. Un enlace aparte para volver sería una cosa más que perder en
// una mesa con comida encima.
//
// Sede y mesa vienen de la RUTA y no hay control para cambiarlas: la mesa es el único dato que
// el QR existe para llevar.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { cop } from '@/lib/cop'
import { ensureFontLoaded, fontStack } from '@/lib/menuAppearance'
import type { MenuAppearanceConfig } from '@/lib/menuAppearance'
import { mockPublishedConfig } from '@/mock/menuAppearance'
import type { Addon, CartItem, StorefrontProduct } from '@/lib/storefront'
import type { CartItemConfig } from '@/stores/cart'
import * as storefront from '@/services/storefront.api'
import { editMyOrder, getMyOrder, type MyOrder } from '@/services/myOrder.api'
import { useCartStore } from '@/stores/cart'
import { useGuestProfileStore } from '@/stores/guestProfile'
import ProductSheet from '@/components/storefront/ProductSheet.vue'
import CartBar from '@/components/storefront/CartBar.vue'

const route = useRoute()
const cart = useCartStore()
const guestProfile = useGuestProfileStore()

const branchCode = computed(() => String(route.params.branchCode ?? ''))
const tableCode = computed(() => String(route.params.tableCode ?? ''))

// El token del pedido vivo se guarda POR MESA y por dispositivo. Es lo que hace que reabrir el
// QR devuelva a Ana a su pedido en vez de a un carrito vacío — y que el teléfono de Ana no
// abra el pedido de Luis.
const tokenKey = computed(() => `table-order:${branchCode.value}:${tableCode.value}`)

type Phase = 'loading' | 'dead-end' | 'name' | 'menu' | 'review' | 'order'
const phase = ref<Phase>('loading')
const table = ref<storefront.StorefrontTable | null>(null)
// El callejón sin salida nombra el problema. Quien lo lee está de pie delante de una calcomanía
// con el teléfono en la mano: necesita saber si vuelve a escanear o llama a alguien, no un
// "algo salió mal" ni —mucho peor— una carta vacía que parece un restaurante sin comida.
const deadEnd = ref('')
const submitting = ref(false)
const submitError = ref('')

const config = ref<MenuAppearanceConfig>(mockPublishedConfig)
const products = ref<StorefrontProduct[]>([])
const addons = ref<Addon[]>([])
const categories = ref<{ id: string; name: string }[]>([])

const dinerName = ref('')
const myOrder = ref<MyOrder | null>(null)

const sheetProduct = ref<StorefrontProduct | null>(null)
const editingLine = ref<CartItem | null>(null)

// Las mismas variables que pinta la carta pública: el QR de la mesa es la misma tienda,
// entrada por otra puerta, y tiene que llevar la paleta del negocio igual que ella.
const themeVars = computed(() => {
  const t = config.value.theme
  return {
    '--sf-primary': t.primaryColor,
    '--sf-bg': t.backgroundColor,
    '--sf-text': t.textColor,
    '--sf-surface': `color-mix(in oklab, ${t.backgroundColor} 60%, white)`,
    '--sf-line': `color-mix(in oklab, ${t.textColor} 14%, transparent)`,
    backgroundColor: 'var(--sf-bg)',
    color: 'var(--sf-text)',
    fontFamily: fontStack(t.fontFamily),
  } as Record<string, string>
})

const productsByCategory = computed(() =>
  categories.value.map((c) => ({
    ...c,
    products: products.value.filter((p) => p.categoryId === c.id),
  })),
)

/**
 * Carga el pedido detrás del token.
 *
 * `forgetIfMissing` separa dos situaciones que parecen la misma y no lo son:
 *
 * - **Al abrir la pantalla** (`true`): un token guardado que ya no resuelve es basura de una
 *   comida anterior. La mesa se recicla, así que se olvida y el siguiente comensal pide de cero.
 * - **Justo después de confirmar** (`false`): el pedido acaba de crearse. Si la lectura falla
 *   —un corte de red de dos segundos—, borrar el token dejaría al comensal sin forma de pedir
 *   otra ronda sobre un pedido que SÍ existe y ya está en cocina. Se conserva y se reconcilia
 *   la próxima vez que abra.
 */
async function loadOrder(token: string, forgetIfMissing = true): Promise<boolean> {
  let order: MyOrder | null = null
  try {
    order = await getMyOrder(token)
  } catch {
    order = null
  }
  if (!order || order.status !== 'open') {
    if (forgetIfMissing) localStorage.removeItem(tokenKey.value)
    return false
  }
  myOrder.value = order
  return true
}

onMounted(async () => {
  try {
    table.value = await storefront.resolveTable(branchCode.value, tableCode.value)
  } catch {
    deadEnd.value =
      'Este código no corresponde a ninguna mesa. Vuelve a escanear el QR o pídele ayuda a alguien del restaurante.'
    phase.value = 'dead-end'
    return
  }

  try {
    config.value = await storefront.getAppearance()
    ensureFontLoaded(config.value.theme.fontFamily)
  } catch {
    /* la apariencia por defecto sirve: la página nunca se queda en blanco */
  }

  try {
    const menu = await storefront.getMenu(branchCode.value)
    products.value = menu.products
    addons.value = menu.addons
    categories.value = menu.categories
  } catch {
    /* sin carta no hay nada que pedir, pero la mesa y su estado siguen dichos */
  }

  // Precargado del perfil de invitado (que escribe en el carrito) y EDITABLE: repetir el
  // nombre es fricción, pero Ana le pasa el teléfono a Luis para que pida y la comanda de Luis
  // no puede decir "Ana".
  try {
    await guestProfile.load()
    dinerName.value = cart.customerName
  } catch {
    // Una PRECARGA no puede impedir pedir. El perfil de invitado es una comodidad —ahorrar
    // teclear un nombre—, y que falle sólo debe costar esa comodidad: sin este catch, un
    // perfil ausente dejaba la pantalla colgada en "cargando" con alguien esperando en la mesa.
  }

  const saved = localStorage.getItem(tokenKey.value)
  if (saved && (await loadOrder(saved))) {
    phase.value = 'order'
    return
  }
  phase.value = 'name'
})

function startOrdering() {
  if (!dinerName.value.trim()) return
  // `reset()` limpia el carrito pero también el nombre que la precarga dejó puesto; el nombre
  // de esta pantalla vive en `dinerName`, no en el carrito, justamente por eso.
  cart.reset()
  phase.value = 'menu'
}

function openProduct(product: StorefrontProduct) {
  editingLine.value = null
  sheetProduct.value = product
}

function editLine(uid: string) {
  const line = cart.items.find((it) => it.uid === uid) ?? null
  if (!line) return
  editingLine.value = line
  sheetProduct.value = products.value.find((p) => p.id === line.productId) ?? null
}

function submitSheet(configLine: CartItemConfig) {
  if (editingLine.value) cart.updateItem(editingLine.value.uid, configLine)
  else cart.addItem(configLine)
  sheetProduct.value = null
  editingLine.value = null
}

async function confirm() {
  if (!cart.items.length || submitting.value) return
  submitting.value = true
  submitError.value = ''
  const lines = cart.items.map((it) => ({
    variantId: it.variantId ?? '',
    quantity: it.quantity,
    addonIds: it.addons.map((a) => a.id),
    removedIngredients: it.removed,
    note: it.note,
  }))
  try {
    // Cada «Confirmar» es una RONDA, y la segunda no es un pedido nuevo: se añade al que este
    // comensal ya tiene abierto. Crear otro partiría en dos la cuenta de una sola persona y la
    // cocina vería dos comandas donde hay una.
    const existing = localStorage.getItem(tokenKey.value)
    if (existing && myOrder.value) {
      myOrder.value = await editMyOrder(existing, { add: lines })
    } else {
      const created = await storefront.createTableOrder(branchCode.value, tableCode.value, {
        dinerName: dinerName.value.trim(),
        lines,
      })
      if (created.editToken) {
        localStorage.setItem(tokenKey.value, created.editToken)
        await loadOrder(created.editToken, false)
      }
    }
    // NO se persiste el nombre en el perfil de invitado: `persist()` manda también el
    // teléfono, y aquí no hay ninguno — guardarlo borraría el que el cliente ya tuviera de un
    // domicilio anterior. Precargar sí, escribir no.
    cart.reset()
    phase.value = 'order'
  } catch (err: unknown) {
    // Lo que el comensal lee cuando la caja está cerrada. No dice "409" ni "cash_closed": dice
    // lo único que le sirve.
    const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
    submitError.value =
      code === 'cash_closed'
        ? 'El restaurante todavía no está recibiendo pedidos. Llama a alguien del local.'
        : 'No pudimos enviar tu pedido. Inténtalo otra vez.'
  } finally {
    submitting.value = false
  }
}

function addAnotherRound() {
  cart.reset()
  phase.value = 'menu'
}
</script>

<template>
  <div class="min-h-dvh" :style="themeVars">
    <!-- Callejón sin salida: nombra el problema y no enseña carta ni carrito. -->
    <div v-if="phase === 'dead-end'" class="grid min-h-dvh place-items-center px-6 text-center">
      <div class="max-w-sm space-y-3">
        <i class="pi pi-qrcode text-3xl opacity-40" />
        <p class="text-base font-semibold">No encontramos esa mesa</p>
        <p class="text-sm opacity-70">{{ deadEnd }}</p>
      </div>
    </div>

    <div v-else-if="phase === 'loading'" class="grid min-h-dvh place-items-center">
      <i class="pi pi-spinner pi-spin text-2xl opacity-40" />
    </div>

    <template v-else>
      <!-- La mesa, siempre a la vista y sin control para cambiarla. Es el dato que el QR lleva. -->
      <header class="sticky top-0 z-30 flex items-center gap-3 border-b border-black/10 bg-[var(--sf-surface)] px-4 py-3 backdropentity">
        <span
          class="rounded-lg bg-[var(--sf-primary)] px-2.5 py-1 font-mono text-[13px] font-bold text-white tabular-nums"
          data-testid="table-badge"
        >
          Mesa {{ table?.number }}
        </span>
        <span class="text-sm opacity-70">{{ table?.branchName }}</span>
        <span v-if="dinerName && phase !== 'name'" class="ml-auto text-sm font-medium">{{ dinerName }}</span>
      </header>

      <!-- Cerrado: se dice ANTES del carrito, no al confirmar. -->
      <p
        v-if="table && !table.canOrderNow"
        class="mx-4 mt-4 rounded-xl bg-black/5 px-4 py-3 text-sm"
        data-testid="closed-notice"
      >
        Todavía no estamos recibiendo pedidos. Si ya estás en la mesa, llama a alguien del local.
      </p>

      <!-- 1 · El nombre, antes del carrito. Sin teléfono, sin cuenta, sin login. -->
      <section v-if="phase === 'name'" class="px-4 py-8">
        <h1 class="text-xl font-semibold">¿Cómo te llamamos?</h1>
        <p class="mt-1 text-sm opacity-70">
          Sólo para que la cocina y la caja sepan cuál pedido es el tuyo.
        </p>
        <input
          v-model="dinerName"
          type="text"
          maxlength="60"
          placeholder="Tu nombre"
          data-testid="diner-name"
          class="mt-5 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base outline-none focus:border-[var(--sf-primary)]"
        />
        <button
          type="button"
          data-testid="start-ordering"
          class="mt-4 w-full rounded-xl bg-[var(--sf-primary)] px-4 py-3 font-semibold text-white disabled:opacity-40"
          :disabled="!dinerName.trim() || !table?.canOrderNow"
          @click="startOrdering"
        >
          Ver la carta
        </button>
      </section>

      <!-- 2 · La carta. El carrito no confirma nada desde aquí: sólo lleva a revisar. -->
      <section v-else-if="phase === 'menu'" class="px-4 pb-28 pt-4">
        <div v-for="cat in productsByCategory" :key="cat.id" class="mb-6">
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide opacity-60">{{ cat.name }}</h2>
          <ul class="space-y-2">
            <li v-for="p in cat.products" :key="p.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl bg-white px-4 py-3 text-left shadow-sm"
                @click="openProduct(p)"
              >
                <span class="flex-1">
                  <span class="block font-medium">{{ p.name }}</span>
                  <span v-if="p.description" class="block text-xs opacity-60">{{ p.description }}</span>
                </span>
                <span class="font-mono text-sm font-semibold tabular-nums">{{ cop(p.price) }}</span>
              </button>
            </li>
          </ul>
        </div>
        <CartBar
          v-if="cart.itemCount"
          :item-count="cart.itemCount"
          :total="cart.subtotal"
          @open="phase = 'review'"
        />
      </section>

      <!-- 3 · Revisar y confirmar. Confirmar ES el compromiso: de aquí sale a cocina. -->
      <section v-else-if="phase === 'review'" class="px-4 pb-8 pt-4">
        <h1 class="text-xl font-semibold">Revisa tu pedido</h1>
        <ul class="mt-4 space-y-3">
          <li
            v-for="it in cart.items"
            :key="it.uid"
            class="rounded-xl bg-white px-4 py-3 shadow-sm"
            data-testid="review-line"
          >
            <div class="flex items-baseline gap-2">
              <span class="font-mono text-sm tabular-nums opacity-60">{{ it.quantity }}×</span>
              <span class="flex-1 font-medium">{{ it.name }}</span>
              <button type="button" class="text-xs underline opacity-60" @click="editLine(it.uid)">
                cambiar
              </button>
            </div>
            <p v-if="it.removed.length" class="mt-1 text-xs opacity-70">
              Sin {{ it.removed.join(' · sin ') }}
            </p>
            <p v-if="it.note" class="mt-1 text-xs italic opacity-70">{{ it.note }}</p>
          </li>
        </ul>
        <p class="mt-4 flex items-baseline justify-between text-base font-semibold">
          <span>Total</span>
          <span class="font-mono tabular-nums">{{ cop(cart.subtotal) }}</span>
        </p>
        <p v-if="submitError" class="mt-3 text-sm text-red-700" data-testid="submit-error">
          {{ submitError }}
        </p>
        <button
          type="button"
          data-testid="confirm"
          class="mt-5 w-full rounded-xl bg-[var(--sf-primary)] px-4 py-4 text-lg font-bold text-white disabled:opacity-40"
          :disabled="!cart.items.length || submitting || !table?.canOrderNow"
          @click="confirm"
        >
          {{ submitting ? 'Enviando…' : 'Confirmar y enviar a cocina' }}
        </button>
        <button type="button" class="mt-3 w-full py-2 text-sm underline opacity-60" @click="phase = 'menu'">
          Seguir pidiendo
        </button>
      </section>

      <!-- 4 · La misma pantalla, ya convertida en el pedido del comensal. -->
      <section v-else-if="phase === 'order'" class="px-4 pb-8 pt-4">
        <p class="rounded-xl bg-[var(--sf-primary)]/10 px-4 py-3 text-sm font-medium" data-testid="in-kitchen">
          Tu pedido está en la cocina.
        </p>
        <ul class="mt-4 space-y-3">
          <li
            v-for="line in myOrder?.lines ?? []"
            :key="line.itemId"
            class="rounded-xl bg-white px-4 py-3 shadow-sm"
            data-testid="order-line"
          >
            <div class="flex items-baseline gap-2">
              <span class="font-mono text-sm tabular-nums opacity-60">{{ line.quantity }}×</span>
              <span class="flex-1 font-medium">{{ line.name }}</span>
              <span class="font-mono text-sm tabular-nums">{{ cop(line.lineSubtotal) }}</span>
            </div>
            <!-- Lo que la estación ya empezó se enseña como no cambiable, con el motivo y SIN
                 controles: un botón que no va a funcionar es peor que ningún botón. -->
            <p v-if="!line.editable" class="mt-1 text-xs opacity-60" data-testid="locked-line">
              {{ line.reason ?? 'Ya está en la cocina.' }}
            </p>
          </li>
        </ul>
        <p class="mt-4 flex items-baseline justify-between text-base font-semibold">
          <span>Total</span>
          <span class="font-mono tabular-nums">{{ cop(myOrder?.total ?? 0) }}</span>
        </p>
        <p class="mt-1 text-xs opacity-60">Se paga en la caja cuando terminen.</p>
        <button
          type="button"
          data-testid="another-round"
          class="mt-5 w-full rounded-xl bg-[var(--sf-primary)] px-4 py-3 font-semibold text-white disabled:opacity-40"
          :disabled="!table?.canOrderNow"
          @click="addAnotherRound"
        >
          Pedir algo más
        </button>
      </section>
    </template>

    <ProductSheet
      v-if="sheetProduct"
      :product="sheetProduct"
      :editing="editingLine"
      :addons="addons"
      :detail="config.dishDetail"
      @submit="submitSheet"
      @close="sheetProduct = null"
    />
  </div>
</template>
