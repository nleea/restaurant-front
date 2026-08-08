<script setup lang="ts">
// Public customer storefront: browse the carta → build the order → checkout, all mock. It consumes
// the SAME appearance config the admin panel edits (theme + brand + block layout) and applies the
// tenant's theme as CSS variables, so the whole page wears each restaurant's palette and font. The
// grid layout from the config is flattened to a single mobile column via gridToLinearOrder(). Public
// route — no auth, no El Pase chrome. Signature: the order builds as a thermal-paper comanda.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { cop } from '@/lib/cop'
import { ensureFontLoaded, fontStack, gridToLinearOrder } from '@/lib/menuAppearance'
import type { MenuAppearanceConfig } from '@/lib/menuAppearance'
import { mockPublishedConfig } from '@/mock/menuAppearance'
import type { Addon, StorefrontCategory, StorefrontProduct } from '@/lib/storefront'
import type { Step } from '@/lib/storefront'
import * as storefront from '@/services/storefront.api'
import { ProofUploadFailed, uploadPaymentProof } from '@/services/paymentProof.api'
import { useCartStore } from '@/stores/cart'
import { useGuestProfileStore } from '@/stores/guestProfile'
import BannerBlock from '@/components/storefront/blocks/BannerBlock.vue'
import FeaturedCategoriesBlock from '@/components/storefront/blocks/FeaturedCategoriesBlock.vue'
import SearchBlock from '@/components/storefront/blocks/SearchBlock.vue'
import FullMenuBlock from '@/components/storefront/blocks/FullMenuBlock.vue'
import FooterBlock from '@/components/storefront/blocks/FooterBlock.vue'
import PromoBlock from '@/components/storefront/blocks/PromoBlock.vue'
import HoursBlock from '@/components/storefront/blocks/HoursBlock.vue'
import GalleryBlock from '@/components/storefront/blocks/GalleryBlock.vue'
import TestimonialsBlock from '@/components/storefront/blocks/TestimonialsBlock.vue'
import ProductSheet from '@/components/storefront/ProductSheet.vue'
import CartBar from '@/components/storefront/CartBar.vue'
import CartStep from '@/components/storefront/CartStep.vue'
import FulfillmentStep from '@/components/storefront/FulfillmentStep.vue'
import PaymentStep from '@/components/storefront/PaymentStep.vue'
import SummaryStep from '@/components/storefront/SummaryStep.vue'
import ConfirmationStep from '@/components/storefront/ConfirmationStep.vue'
import BranchPicker from '@/components/storefront/BranchPicker.vue'

const cart = useCartStore()
const guestProfile = useGuestProfileStore()

// Public opening hours → the "cerrado · abrimos a las X" copy. Informational only; the real
// order gate is the open cash session (a rejected order returns the `cash_closed` code).
const hours = ref<storefront.StorefrontHours | null>(null)
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
function fmtMinute(m: number): string {
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  const period = h < 12 ? 'a. m.' : 'p. m.'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mm} ${period}`
}
const nextOpeningLabel = computed<string | null>(() => {
  const n = hours.value?.nextOpening
  if (!n) return null
  return `${WEEKDAYS[n.weekday]} a las ${fmtMinute(n.minute)}`
})

// Appearance config fetched from the public API; defaults stand in while it loads / on failure, so
// the page never blanks. It's the same contract the admin appearance panel edits.
const config = ref<MenuAppearanceConfig>(mockPublishedConfig)
const brand = computed(() => config.value.brand)
const orderedBlocks = computed(() => gridToLinearOrder(config.value.blocks))
const blockContent = computed(() => config.value.blockContent)

// Theme → CSS variables. Surfaces/lines/muted are mixed off the theme so cards + hairlines adapt to
// any palette (tuned for the light menus restaurants typically choose).
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

// --- Real data (fetched from the public storefront API) --------------------
const loading = ref(true)
const categories = ref<StorefrontCategory[]>([])
const products = ref<StorefrontProduct[]>([])
const addons = ref<Addon[]>([])
// Gallery photos = the real product images (several supported), plus any standalone config images.
const galleryPhotos = computed(() => [
  ...products.value.map((p) => p.imageUrl).filter((u) => u),
  ...config.value.blockContent.gallery.imageUrls,
])

// --- Branch addressing -----------------------------------------------------
// The branch comes from the route (/store/:branchCode?) — never from the cart or a form. An
// unresolvable code must NOT silently fall back to another branch: ordering from a kitchen the
// customer did not choose is the failure this whole change exists to prevent, so it shows the
// picker instead.
const route = useRoute()
const router = useRouter()
const branchCode = computed<string | undefined>(() => {
  const raw = route.params.branchCode
  const value = Array.isArray(raw) ? raw[0] : raw
  return value ? String(value) : undefined
})
const branches = ref<storefront.StorefrontBranch[]>([])
// El WhatsApp de la sede que se está mirando (o la primera). Es la ruta alterna para mandar el
// comprobante — la que la gente ya usa y la única que sirve si la subida falla.
const whatsappHref = computed(() => {
  const branch =
    branches.value.find((b) => b.code === branchCode.value) ?? branches.value[0] ?? null
  const digits = branch?.phone?.replace(/\D/g, '')
  if (!digits) return null
  // El mensaje va ESCRITO, con el número del pedido y el total. Sin eso llega una foto sin
  // contexto y quien atiende el número no sabe de qué pedido es ni cuánto se debía — que es
  // justo el problema que esta ruta existe para resolver. Y el cliente es quien pulsa enviar,
  // así que la invariante del canal (nunca iniciamos una conversación) se cumple sola.
  const text = proofMessage.value
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
})

/** Lo que el cliente manda escrito al abrir WhatsApp. Vacío antes de confirmar el pedido. */
const proofMessage = computed(() => {
  const number = cart.orderNumber
  if (!number) return ''
  return `Hola, mi pedido ${number} por ${cop(cart.total)}. Aquí va mi comprobante.`
})
const branchNotFound = ref(false)
// With no code and several branches, ask before showing a carta that might be the wrong one.
const needsBranchChoice = computed(
  () => !branchCode.value && !branchNotFound.value && branches.value.length > 1,
)
const showPicker = computed(() => branchNotFound.value || needsBranchChoice.value)

function chooseBranch(code: string): void {
  void router.push({ name: 'store', params: { branchCode: code } })
}

async function loadBranchData(): Promise<void> {
  loading.value = true
  branchNotFound.value = false
  const code = branchCode.value
  const [menu, branchList] = await Promise.allSettled([
    storefront.getMenu(code),
    storefront.getBranches(),
  ])
  if (branchList.status === 'fulfilled') branches.value = branchList.value
  if (menu.status === 'fulfilled') {
    categories.value = menu.value.categories
    products.value = menu.value.products
    addons.value = menu.value.addons
  } else if (code && errorCode(menu.reason) === 'branch_not_found') {
    branchNotFound.value = true
    categories.value = []
    products.value = []
    addons.value = []
  }
  loading.value = false
  // Opening hours (best-effort) → enrich the closed-caja message with the next opening time.
  storefront.getStorefrontHours(branchNotFound.value ? undefined : code).then(
    (h) => (hours.value = h),
    () => (hours.value = null),
  )
}


// --- The WhatsApp store token ----------------------------------------------
// The greeting's link carries `?t=<token>`: it identifies the contact who wrote to this
// branch. Two jobs, both invisible to the customer:
//
//   1. Pre-fill name and phone, so a customer on a phone keyboard doesn't retype what they
//      already told us. Both fields stay editable — the token pre-fills, it does not
//      authenticate, and the backend treats it the same way.
//   2. Ride along to the order so the resulting order links to that WhatsApp contact, which
//      is what later lets "tu pedido va en camino" reach them.
//
// It is never rendered: it is a bearer credential, and a token on screen ends up in a shared
// screenshot. An unknown or expired token is ignored in silence (see `resolveStoreSession`).
const storeToken = computed<string | undefined>(() => {
  const raw = route.query.t
  const value = Array.isArray(raw) ? raw[0] : raw
  return value ? String(value) : undefined
})

async function prefillFromToken(): Promise<void> {
  const token = storeToken.value
  if (!token) return
  const session = await storefront.resolveStoreSession(token)
  if (!session) return
  if (session.name) cart.setContact({ name: session.name })
  cart.setContact({ phone: session.phone })
}

onMounted(async () => {
  // Appearance is tenant-level and loads independently of the branch: a failed appearance still
  // lets the carta render, and the defaults keep the page from blanking.
  const cfg = await storefront.getAppearance().catch(() => null)
  if (cfg) config.value = cfg
  ensureFontLoaded(config.value.theme.fontFamily)
  await loadBranchData()
  // Contact prefill in precedence order, weakest first so the strongest lands last: the saved
  // guest profile (a returning customer on this device), then the token (the person who just
  // wrote to us from WhatsApp and clicked this exact link). Both defer to a logged-in account.
  // Chained rather than parallel — racing them would make the winner depend on the network.
  void guestProfile.load().then(prefillFromToken, prefillFromToken)
})

// Prices, availability and variants belong to a branch, so a cart cannot survive a move to
// another one. Clearing it loudly beats silently charging another branch's prices.
const cartClearedOnBranchChange = ref(false)
watch(branchCode, (next, previous) => {
  if (next === previous) return
  if (cart.items.length > 0) {
    cart.reset()
    cartClearedOnBranchChange.value = true
  }
  void loadBranchData()
})

// --- Menu browsing ---------------------------------------------------------
const search = ref('')
const menuGroups = computed(() => {
  const q = search.value.trim().toLowerCase()
  return categories.value
    .map((category) => ({
      category,
      products: products.value.filter(
        (p) => p.categoryId === category.id && (q === '' || p.name.toLowerCase().includes(q)),
      ),
    }))
    .filter((g) => g.products.length > 0)
})

function jumpToCategory(id: string) {
  document.getElementById(`sf-cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// --- Product detail sheet --------------------------------------------------
const sheetProduct = ref<StorefrontProduct | null>(null)
const editingUid = ref<string | null>(null)
const editingItem = computed(() =>
  editingUid.value ? (cart.items.find((it) => it.uid === editingUid.value) ?? null) : null,
)

function openProduct(p: StorefrontProduct) {
  editingUid.value = null
  sheetProduct.value = p
}
function quickAdd(p: StorefrontProduct) {
  cart.addItem({ productId: p.id, variantId: p.variantId, name: p.name, unitPrice: p.price, quantity: 1, addons: [], removed: [], note: '' })
}
function editCartLine(uid: string) {
  const item = cart.items.find((it) => it.uid === uid)
  const product = item && products.value.find((p) => p.id === item.productId)
  if (!item || !product) return
  editingUid.value = uid
  sheetProduct.value = product
}
function onSheetSubmit(lineConfig: Parameters<typeof cart.addItem>[0]) {
  if (editingUid.value) cart.updateItem(editingUid.value, lineConfig)
  else cart.addItem(lineConfig)
  closeSheet()
}
function closeSheet() {
  sheetProduct.value = null
  editingUid.value = null
}

// --- Step machine ----------------------------------------------------------
const step = ref<Step>('menu')
const STEP_TITLE: Partial<Record<Step, string>> = {
  cart: 'Tu comanda',
  fulfillment: 'Entrega',
  payment: 'Pago',
  summary: 'Resumen',
}
// Un domicilio SALTA el paso de pago, en los dos sentidos. Todavía no sabe cuánto cuesta —falta
// cotizar el domicilio— así que ese paso pediría elegir cómo pagar una cifra que el cliente no
// ha visto, y adjuntar un comprobante por un total equivocado. Lo elige después, desde el enlace
// que le llega por WhatsApp con el total definitivo. Recoger en tienda conserva el paso: su total
// ya es el definitivo.
const skipsPayment = computed(() => cart.fulfillment === 'delivery')
const STEP_BACK = computed<Partial<Record<Step, Step>>>(() => ({
  cart: 'menu',
  fulfillment: 'cart',
  payment: 'fulfillment',
  summary: skipsPayment.value ? 'fulfillment' : 'payment',
}))
function go(to: Step) {
  // Un solo sitio decide: cualquier camino hacia `payment` en un domicilio aterriza en el
  // resumen. Así el salto no depende de que cada `@next` se acuerde.
  step.value = to === 'payment' && skipsPayment.value ? 'summary' : to
}
function goBack() {
  const prev = STEP_BACK.value[step.value]
  if (prev) step.value = prev
}
// Place the real order: assemble the payload from the cart (lines carry the sellable variant id),
// POST it, then move to the confirmation with the server's order number + status. On failure the
// cart is untouched so the customer can retry.
const submitting = ref(false)
const submitError = ref(false)
// Distinct copy when the backend rejects with `cash_closed` (409) — the caja is closed, so no
// channel accepts orders. A later change enriches this with the next opening time.
const submitErrorMsg = ref<string | undefined>(undefined)

// Read a domain error `code` off an axios-style error without importing axios.
function errorCode(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { code?: string } } })?.response?.data
  return data?.code
}
async function confirmOrder() {
  if (submitting.value) return
  const lines = cart.items
    .filter((it) => it.variantId)
    .map((it) => ({
      variantId: it.variantId as string,
      quantity: it.quantity,
      addonIds: it.addons.map((a) => a.id),
      removedIngredients: it.removed,
      note: it.note,
    }))
  if (!lines.length) {
    submitError.value = true
    return
  }
  const isDelivery = cart.fulfillment === 'delivery'
  const gps = cart.gps
  const addr = cart.address
  const addressText = isDelivery
    ? [`calle ${addr.street}  ${addr.number}`, addr.neighborhood, addr.city].filter((s) => s.trim()).join(', ')
    : undefined
  submitting.value = true
  submitError.value = false
  submitErrorMsg.value = undefined
  try {
    const order = await storefront.createOrder(
      {
      customer: { name: cart.customerName.trim(), phone: cart.customerPhone.trim() },
      fulfillment: {
        type: isDelivery ? 'delivery' : 'pickup',
        addressText: isDelivery ? (cart.locationMode === 'gps' ? undefined : addressText) : undefined,
        neighborhood: isDelivery ? addr.neighborhood : undefined,
        latitude: isDelivery && gps ? gps.lat : undefined,
        longitude: isDelivery && gps ? gps.lng : undefined,
        reference: isDelivery ? (cart.locationMode === 'gps' ? gps?.reference : addr.reference) : undefined,
      },
      // Ausente en un domicilio: el servidor lo rechaza como intento prematuro y el enlace de
      // pago lo recoge con el total ya cotizado delante.
      paymentMethod: isDelivery ? undefined : (cart.paymentMethodId ?? ''),
      lines,
      // Links the order to the WhatsApp contact. Absent, expired or from another branch, the
      // order is still created and matched by phone — the token only ever adds.
      storeToken: storeToken.value,
      },
      // Same branch the carta was read from — the URL is the single source of truth.
      branchCode.value,
    )
    cart.setConfirmedOrder(order.orderNumber, order.status, order.editToken)
    // El comprobante viaja AHORA, con el token que acaba de nacer: antes no había pedido al que
    // atarlo. Si falla, el pedido sigue en pie y se le dice — un comprobante que el cliente cree
    // mandado y no llegó es una discusión en la puerta.
    // Nunca en un domicilio: `cart.total` todavía no incluye el domicilio, así que declararlo
    // aquí registraría un comprobante por menos de lo que se va a cobrar.
    if (!isDelivery && cart.paymentProof && order.editToken) {
      try {
        await uploadPaymentProof(order.editToken, cart.paymentProof, cart.total)
        cart.setPaymentProofError(null)
      } catch (proofError) {
        cart.setPaymentProofError(
          proofError instanceof ProofUploadFailed
            ? proofError.message
            : 'No pudimos subir tu comprobante.',
        )
      }
    }
    // Persist this guest's contact for next time (non-blocking; skipped when logged in). Store the
    // best available address string: the composed manual address, else the GPS reference.
    void guestProfile.persist(isDelivery ? (addressText ?? gps?.reference ?? '') : '')
    step.value = 'confirmation'
  } catch (err) {
    submitError.value = true
    if (errorCode(err) === 'cash_closed') {
      submitErrorMsg.value = nextOpeningLabel.value
        ? `El restaurante está cerrado. Abrimos el ${nextOpeningLabel.value}.`
        : 'El restaurante está cerrado en este momento y no está recibiendo pedidos. Intenta más tarde.'
    }
  } finally {
    submitting.value = false
  }
}
function restart() {
  cart.reset()
  search.value = ''
  submitError.value = false
  step.value = 'menu'
}

watch(step, () => window.scrollTo({ top: 0 }))
</script>

<template>
  <div class="storefront min-h-screen" :style="themeVars">
    <!-- Branch gate. Replaces the carta rather than sitting above it: showing a menu while asking
         which branch it belongs to is exactly the ambiguity this screen exists to remove. -->
    <BranchPicker
      v-if="!loading && showPicker"
      :branches="branches"
      :not-found="branchNotFound"
      :brand-name="brand.restaurantName"
      @select="chooseBranch"
    />

    <template v-else>
    <!-- Cart dropped because the customer moved to another branch's carta. -->
    <p
      v-if="cartClearedOnBranchChange"
      class="border-b border-[var(--sf-line)] bg-[var(--sf-paper)] px-4 py-3 text-sm"
      role="status"
    >
      Cambiaste de sede, así que vaciamos el carrito: cada sede tiene su propia carta y sus precios.
    </p>

    <!-- Step header (not on the menu or the confirmation) -->
    <header
      v-if="STEP_TITLE[step]"
      class="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--sf-line)] bg-[color-mix(in_oklab,var(--sf-bg)_88%,transparent)] px-4 py-3 backdrop-blur"
    >
      <button
        type="button"
        class="grid size-9 place-items-center rounded-full text-[var(--sf-text)] transition hover:bg-[var(--sf-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)]"
        aria-label="Volver"
        @click="goBack"
      >
        <i class="pi pi-arrow-left text-sm" />
      </button>
      <h1 class="text-base font-bold">{{ STEP_TITLE[step] }}</h1>
    </header>

    <!-- MENU: blocks in linear order -->
    <div v-if="step === 'menu'" class="flex flex-col gap-6 pb-28">
      <template v-for="block in orderedBlocks" :key="block.id">
        <BannerBlock v-if="block.id === 'banner'" :name="brand.restaurantName" :banner-url="brand.bannerUrl" :logo-url="brand.logoUrl" />
        <FeaturedCategoriesBlock v-else-if="block.id === 'featured_categories'" :categories="categories" @jump="jumpToCategory" />
        <SearchBlock v-else-if="block.id === 'search'" v-model="search" />
        <template v-else-if="block.id === 'full_menu'">
          <div v-if="loading" class="px-4 py-10 text-center text-[13px] text-[var(--sf-muted)]">Cargando la carta…</div>
          <div v-else-if="!menuGroups.length" class="px-4 py-10 text-center text-[13px] text-[var(--sf-muted)]">
            Aún no hay platos disponibles.
          </div>
          <FullMenuBlock v-else :groups="menuGroups" :card="config.dishCard" @open="openProduct" @add="quickAdd" />
        </template>
        <PromoBlock v-else-if="block.id === 'promo'" :content="blockContent.promo" />
        <HoursBlock v-else-if="block.id === 'hours'" :rows="blockContent.hours.rows" />
        <GalleryBlock v-else-if="block.id === 'gallery'" :photos="galleryPhotos" />
        <TestimonialsBlock v-else-if="block.id === 'testimonials'" :items="blockContent.testimonials.items" />
        <FooterBlock v-else-if="block.id === 'footer'" :name="brand.restaurantName" />
      </template>
    </div>

    <!-- FLOW steps -->
    <CartStep v-else-if="step === 'cart'" :restaurant-name="brand.restaurantName" @edit="editCartLine" @next="go('fulfillment')" @back="go('menu')" />
    <FulfillmentStep v-else-if="step === 'fulfillment'" @next="go('payment')" @back="go('cart')" />
    <PaymentStep v-else-if="step === 'payment'" :payment-qr-url="config.brand.paymentQrUrl ?? ''" :whatsapp-href="whatsappHref" @next="go('summary')" @back="go('fulfillment')" />
    <SummaryStep v-else-if="step === 'summary'" :restaurant-name="brand.restaurantName" :submitting="submitting" :error="submitError" :error-message="submitErrorMsg" @confirm="confirmOrder" @back="goBack" />
    <ConfirmationStep v-else-if="step === 'confirmation'" :restaurant-name="brand.restaurantName" :whatsapp-href="whatsappHref" @restart="restart" />

    <!-- Persistent cart bar (menu only) -->
    <CartBar v-if="step === 'menu' && cart.itemCount > 0" :item-count="cart.itemCount" :total="cart.total" @open="go('cart')" />

    <!-- Product detail overlay -->
    <ProductSheet v-if="sheetProduct" :product="sheetProduct" :editing="editingItem" :addons="addons" :detail="config.dishDetail" @submit="onSheetSubmit" @close="closeSheet" />
    </template>
  </div>
</template>
