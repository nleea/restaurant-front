<script setup lang="ts">
// Fulfillment step: pick up at the restaurant, or delivery. Delivery takes a location two ways —
// a structured address form, or the browser's geolocation (with a graceful fallback when it's
// denied or fails). Continue is gated until the chosen path has what it needs.
import { ref } from 'vue'
import { useCartStore } from '@/stores/cart'
import { PICKUP_ADDRESS, PICKUP_ETA, DELIVERY_ETA } from '@/lib/storefront'

const emit = defineEmits<{ (e: 'next'): void; (e: 'back'): void }>()
const cart = useCartStore()

const geoState = ref<'idle' | 'locating' | 'error'>('idle')
const geoError = ref('')

function useMyLocation() {
  if (!('geolocation' in navigator)) {
    geoState.value = 'error'
    geoError.value = 'Tu navegador no permite compartir ubicación. Escribe la dirección a mano.'
    return
  }
  geoState.value = 'locating'
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      cart.setGps({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        reference: cart.gps?.reference ?? '',
      })
      geoState.value = 'idle'
    },
    (err) => {
      geoState.value = 'error'
      geoError.value =
        err.code === err.PERMISSION_DENIED
          ? 'No diste permiso de ubicación. Puedes escribir la dirección a mano.'
          : 'No pudimos detectar tu ubicación. Escribe la dirección a mano.'
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
    <!-- Contact: name + phone are required to place the order -->
    <div class="flex flex-col gap-2.5">
      <p class="text-[13px] font-semibold text-[var(--sf-text)]">Tus datos</p>
      <input :value="cart.customerName" placeholder="Nombre" class="sf-input" @input="cart.setContact({ name: ($event.target as HTMLInputElement).value })" />
      <input :value="cart.customerPhone" type="tel" inputmode="tel" placeholder="Teléfono" class="sf-input" @input="cart.setContact({ phone: ($event.target as HTMLInputElement).value })" />
    </div>

    <!-- Pickup vs delivery -->
    <div class="grid grid-cols-2 gap-3">
      <button
        type="button"
        class="flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition"
        :class="cart.fulfillment === 'pickup' ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_8%,transparent)]' : 'border-[var(--sf-line)] bg-[var(--sf-surface)]'"
        @click="cart.setFulfillment('pickup')"
      >
        <i class="pi pi-shop text-lg text-[var(--sf-primary)]" />
        <span class="font-semibold text-[var(--sf-text)]">Recoger</span>
        <span class="text-[11px] text-[var(--sf-muted)]">en el local</span>
      </button>
      <button
        type="button"
        class="flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition"
        :class="cart.fulfillment === 'delivery' ? 'border-[var(--sf-primary)] bg-[color-mix(in_oklab,var(--sf-primary)_8%,transparent)]' : 'border-[var(--sf-line)] bg-[var(--sf-surface)]'"
        @click="cart.setFulfillment('delivery')"
      >
        <i class="pi pi-send text-lg text-[var(--sf-primary)]" />
        <span class="font-semibold text-[var(--sf-text)]">Domicilio</span>
        <span class="text-[11px] text-[var(--sf-muted)]">a tu ubicación</span>
      </button>
    </div>

    <!-- Pickup detail -->
    <div v-if="cart.fulfillment === 'pickup'" class="rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)] p-4">
      <p class="text-[13px] font-semibold text-[var(--sf-text)]"><i class="pi pi-map-marker text-[12px] text-[var(--sf-primary)]" /> {{ PICKUP_ADDRESS }}</p>
      <p class="mt-1 text-[12px] text-[var(--sf-muted)]">Listo para recoger en aprox. {{ PICKUP_ETA }}.</p>
    </div>

    <!-- Delivery detail -->
    <template v-else>
      <!-- Location mode -->
      <div class="flex gap-1 rounded-full border border-[var(--sf-line)] bg-[var(--sf-surface)] p-1">
        <button
          type="button"
          class="flex-1 rounded-full py-2 text-[13px] font-medium transition"
          :class="cart.locationMode === 'manual' ? 'bg-[var(--sf-primary)] text-white' : 'text-[var(--sf-muted)]'"
          @click="cart.setLocationMode('manual')"
        >
          Escribir dirección
        </button>
        <button
          type="button"
          class="flex-1 rounded-full py-2 text-[13px] font-medium transition"
          :class="cart.locationMode === 'gps' ? 'bg-[var(--sf-primary)] text-white' : 'text-[var(--sf-muted)]'"
          @click="cart.setLocationMode('gps')"
        >
          Usar mi ubicación
        </button>
      </div>

      <!-- Manual address -->
      <div v-if="cart.locationMode === 'manual'" class="flex flex-col gap-2.5">
        <div class="grid grid-cols-3 gap-2.5">
          <input :value="cart.address.street" placeholder="Calle" class="sf-input col-span-2" @input="cart.setAddress({ street: ($event.target as HTMLInputElement).value })" />
          <input :value="cart.address.number" placeholder="Número" class="sf-input" @input="cart.setAddress({ number: ($event.target as HTMLInputElement).value })" />
        </div>
        <input :value="cart.address.neighborhood" placeholder="Barrio" class="sf-input" @input="cart.setAddress({ neighborhood: ($event.target as HTMLInputElement).value })" />
        <input :value="cart.address.city" placeholder="Ciudad" class="sf-input" @input="cart.setAddress({ city: ($event.target as HTMLInputElement).value })" />
        <input :value="cart.address.reference" placeholder="Referencia (apto 302, portería azul…)" class="sf-input" @input="cart.setAddress({ reference: ($event.target as HTMLInputElement).value })" />
      </div>

      <!-- GPS -->
      <div v-else class="flex flex-col gap-2.5">
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--sf-primary)] py-4 font-medium text-[var(--sf-primary)] transition active:scale-[0.99]"
          :disabled="geoState === 'locating'"
          @click="useMyLocation"
        >
          <i class="pi text-sm" :class="geoState === 'locating' ? 'pi-spin pi-spinner' : 'pi-compass'" />
          {{ geoState === 'locating' ? 'Detectando…' : cart.gps ? 'Actualizar ubicación' : 'Detectar mi ubicación' }}
        </button>

        <div v-if="cart.gps" class="overflow-hidden rounded-2xl border border-[var(--sf-line)] bg-[var(--sf-surface)]">
          <!-- Static mock mini-map: a pin over a hatched field. -->
          <div class="relative grid h-28 place-items-center" :style="{ background: 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--sf-text) 5%, transparent) 0 10px, transparent 10px 20px), var(--sf-surface)' }">
            <i class="pi pi-map-marker text-2xl text-[var(--sf-primary)] drop-shadow" />
            <span class="absolute bottom-2 right-2 rounded-full bg-[var(--sf-bg)] px-2 py-0.5 font-mono text-[10px] tabular-nums text-[var(--sf-muted)]">
              {{ cart.gps.lat.toFixed(4) }}, {{ cart.gps.lng.toFixed(4) }}
            </span>
          </div>
          <p class="px-3 py-2 text-[12px] font-medium text-[var(--sf-text)]"><i class="pi pi-check-circle text-[11px] text-[var(--sf-primary)]" /> Ubicación detectada</p>
        </div>

        <p v-if="geoState === 'error'" class="rounded-xl border border-[var(--sf-line)] bg-[var(--sf-surface)] px-3 py-2 text-[12px] text-[var(--sf-muted)]">
          <i class="pi pi-info-circle text-[11px]" /> {{ geoError }}
        </p>

        <input :value="cart.gps?.reference ?? ''" placeholder="Referencia para el domiciliario (opcional)" class="sf-input" @input="cart.setGps(cart.gps ? { ...cart.gps, reference: ($event.target as HTMLInputElement).value } : { lat: 0, lng: 0, reference: ($event.target as HTMLInputElement).value })" />
      </div>
    </template>

    <p v-if="cart.fulfillment === 'delivery'" class="text-center text-[11px] text-[var(--sf-muted)]">Entrega estimada en {{ DELIVERY_ETA }} · El valor del domicilio se confirma después por WhatsApp</p>

    <button
      type="button"
      :disabled="!cart.fulfillmentReady"
      class="w-full rounded-full bg-[var(--sf-primary)] py-3.5 font-semibold text-white transition active:scale-[0.99] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-primary)] focus-visible:ring-offset-2"
      @click="emit('next')"
    >
      Continuar al pago
    </button>
  </div>
</template>

<style scoped>
.sf-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--sf-line);
  background: var(--sf-surface);
  padding: 0.625rem 0.75rem;
  font-size: 14px;
  color: var(--sf-text);
  outline: none;
}
.sf-input::placeholder {
  color: var(--sf-muted);
}
.sf-input:focus-visible {
  box-shadow: 0 0 0 2px var(--sf-primary);
}
</style>
