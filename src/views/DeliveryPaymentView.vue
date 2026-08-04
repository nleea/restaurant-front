<script setup lang="ts">
// La pantalla donde el cliente paga su domicilio ya cotizado. Es el final del camino que empieza
// en la carta: el pedido se tomó sin precio de domicilio, el servidor lo cotizó, y este enlace
// llegó por WhatsApp con el total definitivo.
//
// Dos reglas la gobiernan:
//
// 1. **Ninguna cifra se calcula aquí.** Subtotal, domicilio, total y saldo vienen del servidor.
//    Un total sumado en el navegador es un total que puede discrepar del que el restaurante va a
//    cobrar, y esa discrepancia se descubre en la puerta con la comida ya entregada.
// 2. **Se declara el SALDO, no el domicilio.** El bug que esta pantalla tenía era exactamente
//    ese: pedía $6.000 por un pedido de $38.000.
//
// Se viste con la misma apariencia que la carta (el mismo contrato que edita el panel de
// administración) para que el cliente reconozca dónde está: un enlace de pago que parece de otro
// sitio es un enlace de pago que no se abre.
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { cop } from '@/lib/cop'
import { mockPublishedConfig } from '@/mock/menuAppearance'
import { ensureFontLoaded, fontStack, type MenuAppearanceConfig } from '@/lib/menuAppearance'
import { mockPaymentMethods } from '@/mock/paymentMethods'
import { MAX_PROOF_BYTES, PROOF_ACCEPT } from '@/services/paymentProof.api'
import { getAppearance, getBranches, type StorefrontBranch } from '@/services/storefront.api'
import {
  declareDeliveryPayment,
  getDeliveryPaymentRequest,
  selectDeliveryPaymentMethod,
  uploadDeliveryPaymentProof,
  type DeliveryPaymentRequest,
} from '@/services/deliveryPayment.api'

const route = useRoute()
const token = computed(() => String(route.params.token ?? ''))

const request = ref<DeliveryPaymentRequest | null>(null)
const loading = ref(true)
const loadError = ref(false)
const actionError = ref<string | null>(null)
const declared = ref(false)
const saving = ref(false)
const proof = ref<File | null>(null)
const tooBig = ref(false)
// Si lo que se declaró llevaba comprobante. Distinto de `proof`, que el formulario puede
// cambiar después: esto es lo que de verdad viajó.
const sentProof = ref(false)
const methodId = ref<string | null>(null)

// --- Apariencia (la misma que la carta) ------------------------------------
const config = ref<MenuAppearanceConfig>(mockPublishedConfig)
const branches = ref<StorefrontBranch[]>([])
const brand = computed(() => config.value.brand)
const themeVars = computed(() => {
  const t = config.value.theme
  return {
    '--sf-primary': t.primaryColor,
    '--sf-bg': t.backgroundColor,
    '--sf-text': t.textColor,
    '--sf-surface': `color-mix(in oklab, ${t.backgroundColor} 60%, white)`,
    '--sf-line': `color-mix(in oklab, ${t.textColor} 14%, transparent)`,
    '--sf-muted': `color-mix(in oklab, ${t.textColor} 55%, ${t.backgroundColor})`,
    backgroundColor: 'var(--sf-bg)',
    color: 'var(--sf-text)',
    fontFamily: fontStack(t.fontFamily),
  } as Record<string, string>
})

// --- Dinero: SIEMPRE del servidor ------------------------------------------
const amountDue = computed(() => Number(request.value?.amount_due ?? 0))
const money = (raw: string | undefined) => cop(Number(raw ?? 0))

const selectedMethod = computed(
  () => mockPaymentMethods.find((m) => m.id === methodId.value) ?? null,
)
const needsProof = computed(() => selectedMethod.value?.needsProof ?? false)

/** El mensaje que el cliente manda escrito. Sin el número y el total llega una foto sin dueño.
 *
 * Sigue existiendo aunque el enlace esté muerto: ese es justo el momento en que el cliente MÁS
 * necesita escribir, y prometerle "escríbenos" sin darle por dónde es peor que no prometer nada.
 */
const whatsappHref = computed(() => {
  const digits = branches.value[0]?.phone?.replace(/\D/g, '')
  if (!digits) return null
  const text = request.value
    ? `Hola, mi pedido ${request.value.order_code} por ${cop(amountDue.value)}. Aquí va mi comprobante.`
    : 'Hola, mi enlace de pago no funciona. ¿Me pueden mandar uno nuevo?'
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
})

async function chooseMethod(id: string) {
  methodId.value = id
  actionError.value = null
  // Guardar la intención no registra dinero: sólo deja dicho cómo piensa pagar, para que quien
  // verifique en el restaurante sepa qué está esperando.
  try {
    await selectDeliveryPaymentMethod(token.value, id)
  } catch {
    actionError.value = 'No pudimos guardar tu método de pago. Puedes seguir igualmente.'
  }
}

function pickProof(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null
  // El tope también se comprueba en el servidor; aquí es para no hacerle subir 40 MB por datos
  // móviles antes de decirle que no.
  tooBig.value = file !== null && file.size > MAX_PROOF_BYTES
  proof.value = tooBig.value ? null : file
}

// Qué se le dice DESPUÉS de confirmar. Son tres situaciones y decirlas igual rompe dos:
//
// - Con comprobante adjunto: llegó de verdad, y sólo falta que una persona lo mire.
// - Sin comprobante y prepago: NO hemos recibido nada. Decirle "recibimos tu pago" es mentira y
//   hace que se dé por terminado — y entonces el comprobante no llega nunca, mientras alguien
//   lo busca en un chat donde no está.
// - Efectivo: no hay comprobante que mandar; paga en la puerta.
const outcome = computed(() => {
  if (!needsProof.value) {
    return {
      icon: 'pi-check-circle',
      title: '¡Listo, tu pedido va en camino!',
      body: 'Pagas en efectivo cuando te lo entreguen. Ten el valor exacto si puedes.',
      wantsProof: false,
    }
  }
  if (sentProof.value) {
    return {
      icon: 'pi-check-circle',
      title: '¡Listo, recibimos tu comprobante!',
      body: 'Una persona del restaurante lo confirma y tu pedido entra a cocina. Te avisamos por WhatsApp.',
      wantsProof: false,
    }
  }
  return {
    icon: 'pi-clock',
    title: 'Nos falta tu comprobante',
    body: 'Anotamos que ya pagaste, pero todavía no nos ha llegado el soporte. Mándanoslo por WhatsApp y confirmamos tu pago para que tu pedido entre a cocina.',
    wantsProof: true,
  }
})

async function confirmPayment() {
  if (!request.value || !methodId.value) return
  saving.value = true
  actionError.value = null
  try {
    // `amountDue` y no el domicilio: se declara lo que falta por pagar del pedido entero.
    if (proof.value) {
      await uploadDeliveryPaymentProof(token.value, amountDue.value, proof.value)
    } else {
      await declareDeliveryPayment(token.value, amountDue.value, methodId.value)
    }
    sentProof.value = proof.value !== null
    declared.value = true
  } catch {
    actionError.value = proof.value
      ? 'No pudimos subir tu comprobante. Puedes mandarlo por WhatsApp.'
      : 'No pudimos registrar tu pago. Intenta de nuevo.'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const [cfg, brs] = await Promise.all([
    getAppearance().catch(() => null),
    getBranches().catch(() => []),
  ])
  if (cfg) {
    config.value = cfg
    // Sin esto la página pinta con la fuente de sistema y luego salta: el cliente ve el precio
    // moverse justo cuando lo está leyendo.
    ensureFontLoaded(cfg.theme.fontFamily)
  }
  branches.value = brs
  try {
    request.value = await getDeliveryPaymentRequest(token.value)
    methodId.value = request.value.payment_method ?? null
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main :style="themeVars" class="min-h-screen">
    <div class="mx-auto w-full max-w-md px-4 py-6">
      <header class="mb-5 text-center">
        <img
          v-if="brand.logoUrl"
          :src="brand.logoUrl"
          :alt="brand.restaurantName"
          class="mx-auto mb-2 h-12 w-auto object-contain"
        />
        <h1 class="font-display text-xl font-bold">{{ brand.restaurantName }}</h1>
        <p class="text-[13px] text-[var(--sf-muted)]">Pago de tu pedido</p>
      </header>

      <p v-if="loading" class="py-16 text-center text-[13px] text-[var(--sf-muted)]">
        Cargando tu pedido…
      </p>

      <!-- Un enlace muerto no puede parecer un error del cliente. -->
      <section
        v-else-if="loadError || !request"
        class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-6 text-center"
      >
        <i class="pi pi-link text-2xl text-[var(--sf-muted)]" />
        <h2 class="mt-3 font-semibold">Este enlace ya no sirve</h2>
        <p class="mt-1 text-[13px] leading-relaxed text-[var(--sf-muted)]">
          Puede que haya vencido, que ya lo hayas usado, o que tu pedido se haya recalculado.
          Escríbenos por WhatsApp y te mandamos uno nuevo.
        </p>
        <a
          v-if="whatsappHref"
          :href="whatsappHref"
          target="_blank"
          rel="noopener"
          class="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--sf-primary)]"
        >
          <i class="pi pi-whatsapp text-[12px]" /> Escribirnos por WhatsApp
        </a>
      </section>

      <template v-else>
        <!-- El pedido, con su dinero desglosado -->
        <section class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-4">
          <div class="flex items-baseline justify-between">
            <h2 class="font-semibold">Pedido {{ request.order_code }}</h2>
            <span class="font-mono text-[11px] text-[var(--sf-muted)]">
              {{ request.quote_distance_km }} km
            </span>
          </div>
          <p v-if="request.address_text" class="mt-0.5 text-[12px] text-[var(--sf-muted)]">
            <i class="pi pi-map-marker text-[10px]" /> {{ request.address_text }}
          </p>

          <ul class="mt-3 flex flex-col gap-1.5 font-mono text-[13px]">
            <li
              v-for="(line, i) in request.lines"
              :key="i"
              class="flex items-start justify-between gap-3"
            >
              <span class="flex-1">{{ line.quantity }}× {{ line.name }}</span>
              <span class="shrink-0 tabular-nums">{{ money(line.line_subtotal) }}</span>
            </li>
          </ul>

          <dl
            class="mt-3 flex flex-col gap-1 border-t border-dashed border-[var(--sf-line)] pt-3 font-mono text-[13px]"
          >
            <div class="flex justify-between text-[var(--sf-muted)]">
              <dt>Subtotal</dt>
              <dd class="tabular-nums">{{ money(request.subtotal) }}</dd>
            </div>
            <div
              v-if="Number(request.discount) > 0"
              class="flex justify-between text-[var(--sf-muted)]"
            >
              <dt>Descuento</dt>
              <dd class="tabular-nums">−{{ money(request.discount) }}</dd>
            </div>
            <div class="flex justify-between text-[var(--sf-muted)]">
              <dt>Domicilio</dt>
              <dd class="tabular-nums">{{ money(request.delivery_fee) }}</dd>
            </div>
            <div
              class="mt-1 flex items-baseline justify-between border-t border-dashed border-[var(--sf-line)] pt-2"
            >
              <dt class="font-sans text-sm font-bold uppercase tracking-wide">A pagar</dt>
              <dd class="text-xl font-bold tabular-nums text-[var(--sf-primary)]">
                {{ money(request.amount_due) }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- Ya declaró: no se le vuelve a pedir. -->
        <section
          v-if="declared"
          class="mt-4 rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-5 text-center"
        >
          <i class="pi text-2xl text-[var(--sf-primary)]" :class="outcome.icon" />
          <h2 class="mt-2 font-semibold" data-outcome-title>{{ outcome.title }}</h2>
          <p class="mt-1 text-[13px] leading-relaxed text-[var(--sf-muted)]">{{ outcome.body }}</p>

          <!-- Cuando falta el comprobante, mandarlo es LA acción, no un enlace discreto al pie:
               es lo único que hace avanzar el pedido, y el mensaje que abre ya lleva el número y
               el total escritos para que llegue con dueño. -->
          <a
            v-if="outcome.wantsProof && whatsappHref"
            :href="whatsappHref"
            target="_blank"
            rel="noopener"
            class="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sf-primary)] py-3 font-semibold text-white transition active:scale-[0.99]"
            data-send-proof
          >
            <i class="pi pi-whatsapp text-[14px]" /> Enviar comprobante por WhatsApp
          </a>
          <a
            v-else-if="whatsappHref"
            :href="whatsappHref"
            target="_blank"
            rel="noopener"
            class="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--sf-primary)]"
          >
            <i class="pi pi-whatsapp text-[12px]" /> Escribirnos por WhatsApp
          </a>
        </section>

        <template v-else>
          <h2
            class="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--sf-muted)]"
          >
            ¿Cómo vas a pagar?
          </h2>
          <div class="flex flex-col gap-3">
            <div v-for="m in mockPaymentMethods" :key="m.id" class="flex flex-col">
              <button
                type="button"
                class="flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition"
                :class="
                  methodId === m.id
                    ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_8%,transparent)]'
                    : 'border-[var(--sf-line)] bg-[var(--sf-surface)]'
                "
                @click="chooseMethod(m.id)"
              >
                <i class="pi text-lg text-[var(--sf-primary)]" :class="m.icon" />
                <span class="flex-1 font-semibold">{{ m.label }}</span>
                <span
                  class="grid size-5 place-items-center rounded-full border-2"
                  :class="
                    methodId === m.id ? 'border-[var(--sf-primary)]' : 'border-[var(--sf-line)]'
                  "
                >
                  <span
                    v-if="methodId === m.id"
                    class="size-2.5 rounded-full bg-[var(--sf-primary)]"
                  />
                </span>
              </button>

              <div
                v-if="methodId === m.id && (m.info || m.needsProof)"
                class="mx-1 -mt-1 rounded-b-2xl border border-t-0 border-[var(--sf-line)] bg-[var(--sf-surface)] px-4 pb-4 pt-3"
              >
                <p v-if="m.info" class="text-[12px] leading-relaxed text-[var(--sf-muted)]">
                  {{ m.info }}
                </p>

                <!-- El QR real del negocio. Mientras no lo suban no se pinta un cuadrito falso
                     que no escanea. -->
                <a
                  v-if="m.needsProof && brand.paymentQrUrl"
                  :href="brand.paymentQrUrl"
                  target="_blank"
                  rel="noopener"
                  class="mt-3 block"
                >
                  <img
                    :src="brand.paymentQrUrl"
                    alt="QR para pagar"
                    class="mx-auto max-h-56 w-auto rounded-xl border border-[var(--sf-line)] bg-white object-contain p-2"
                  />
                  <span class="mt-1 block text-center text-[11px] text-[var(--sf-muted)]">
                    Escanéalo desde tu app del banco · toca para ampliarlo
                  </span>
                </a>

                <div v-if="m.needsProof" class="mt-3">
                  <!-- `label for` y no un ref + click(): esto vive dentro de un `v-for`, donde Vue
                       convierte el ref en un ARRAY y el botón no haría nada. -->
                  <input
                    :id="`proof-${m.id}`"
                    type="file"
                    class="sr-only"
                    :accept="PROOF_ACCEPT"
                    @change="pickProof"
                  />
                  <label
                    :for="`proof-${m.id}`"
                    class="block cursor-pointer rounded-xl border border-dashed border-[var(--sf-line)] py-2.5 text-center text-[12px] font-medium text-[var(--sf-muted)] transition hover:border-[var(--sf-primary)]"
                    data-attach-proof
                  >
                    <i class="pi pi-paperclip text-[11px]" />
                    {{ proof ? proof.name : 'Adjuntar comprobante' }}
                  </label>
                  <p v-if="tooBig" class="mt-2 text-[12px] text-[var(--sf-primary)]">
                    Ese archivo pesa demasiado (máximo 5 MB). Prueba con una captura de pantalla.
                  </p>
                  <!-- La otra ruta, la que la gente ya usa: el banco ofrece "compartir por
                       WhatsApp" justo al terminar la transferencia. Sigue estando aunque el
                       adjunto falle. -->
                  <a
                    v-if="whatsappHref"
                    :href="whatsappHref"
                    target="_blank"
                    rel="noopener"
                    class="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--sf-primary)]"
                  >
                    <i class="pi pi-whatsapp text-[11px]" /> O mándalo por WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>

          <p v-if="actionError" class="mt-3 text-[12px] text-[var(--sf-primary)]">
            {{ actionError }}
          </p>

          <button
            type="button"
            :disabled="!methodId || saving"
            class="mt-4 w-full rounded-full bg-[var(--sf-primary)] py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
            @click="confirmPayment"
          >
            <template v-if="saving">Enviando…</template>
            <template v-else-if="needsProof && proof">Enviar comprobante</template>
            <template v-else-if="needsProof">Ya pagué</template>
            <template v-else>Confirmar {{ money(request.amount_due) }}</template>
          </button>
          <p class="mt-2 text-center text-[11px] leading-relaxed text-[var(--sf-muted)]">
            Una persona del restaurante confirma tu pago antes de que el pedido entre a cocina.
          </p>
        </template>
      </template>
    </div>
  </main>
</template>
