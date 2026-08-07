<script setup lang="ts">
// Where this docket is going. For a delivery order the address IS the destination, so it
// sits with the dupe's heading rather than buried in a side screen — and it stays writable
// for the life of the open order, because the address is heard on the phone and corrected
// out loud ("no, la de la reja verde").
//
// Talks to `services/delivery.api.ts` directly and NOT through `stores/dispatch.ts`: that
// store is write-through against the whole board and ends every mutation in a full
// `loadDeliveries()` — the entire delivery history — which is absurd from an order screen.
import { computed, onMounted, ref, watch } from 'vue'
import AddressSheet from './AddressSheet.vue'
import { useAuthStore } from '@/stores/auth'
import { statusOf } from '@/lib/apiError'
import { createDelivery, getOrderDelivery, updateDelivery } from '@/services/delivery.api'
import type { Delivery } from '@/services/delivery.api'

const props = defineProps<{ orderId: string }>()

const auth = useAuthStore()

const delivery = ref<Delivery | null>(null)
const loading = ref(true)
const loadFailed = ref(false)
const sheetOpen = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)

const canWrite = computed(() => auth.can('delivery.address'))
// `delivery.read` is the dispatcher's gate; an order-taker holds `delivery.address` instead.
// Holding neither means delivery is simply not this user's business.
const visible = computed(() => canWrite.value || auth.can('delivery.read'))
const address = computed(() => delivery.value?.address_text ?? null)

async function load() {
  // Never ask for a record this user may not see — the card is hidden for them anyway, and
  // firing a guaranteed 403 on every delivery comanda is noise in the logs.
  if (!visible.value) return
  loading.value = true
  loadFailed.value = false
  try {
    delivery.value = await getOrderDelivery(props.orderId)
  } catch (e) {
    // 404 is the normal starting point: every delivery order opened before addresses were
    // captured here has no record yet. It is a state to invite, not a failure to report.
    if (statusOf(e) === 404) delivery.value = null
    else loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function save(text: string) {
  saving.value = true
  saveError.value = null
  try {
    delivery.value = delivery.value
      ? await updateDelivery(delivery.value.id, { address_text: text })
      : await createDelivery({ order_id: props.orderId, address_text: text })
    sheetOpen.value = false
  } catch (e) {
    // A 409 means someone else (the board) created it in the meantime — reload rather than
    // insist, so the card shows the address that actually exists.
    if (statusOf(e) === 409) {
      await load()
      sheetOpen.value = false
    } else {
      saveError.value = 'No se pudo guardar la dirección.'
    }
  } finally {
    saving.value = false
  }
}

function open() {
  if (!canWrite.value) return
  saveError.value = null
  sheetOpen.value = true
}

onMounted(load)
watch(() => props.orderId, load)
</script>

<template>
  <div v-if="visible" class="border-b border-dashed border-line px-4 pb-3">
    <p class="eyebrow mb-1">Entregar en</p>

    <!-- Loading: a quiet placeholder, never a spinner that outshines the dupe -->
    <p v-if="loading" class="font-mono text-[11px] text-steel-300">cargando…</p>

    <p v-else-if="loadFailed" class="font-mono text-[11px] text-alert-600">
      No se pudo cargar la dirección.
      <button type="button" class="underline hover:text-alert" @click="load">reintentar</button>
    </p>

    <!-- Has an address: the address itself is the edit affordance -->
    <button
      v-else-if="address && canWrite"
      type="button"
      class="-ml-1 flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left transition hover:text-ember focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      :aria-label="`Corregir la dirección: ${address}`"
      @click="open"
    >
      <i class="pi pi-map-marker mt-0.5 shrink-0 text-[10px] text-steel-400" aria-hidden="true" />
      <span class="min-w-0 flex-1 text-sm leading-snug text-ink">{{ address }}</span>
      <i class="pi pi-pencil mt-0.5 shrink-0 text-[9px] text-steel-400" aria-hidden="true" />
    </button>

    <p v-else-if="address" class="flex items-start gap-1.5 text-sm leading-snug text-ink">
      <i class="pi pi-map-marker mt-0.5 shrink-0 text-[10px] text-steel-400" aria-hidden="true" />
      <span>{{ address }}</span>
    </p>

    <!-- No record yet: an invitation. This is the normal state for orders opened before
         the address was captured here, and after a failed capture at open. -->
    <button
      v-else-if="canWrite"
      type="button"
      class="-ml-1 flex min-h-8 items-center gap-1.5 rounded px-1 text-left text-sm font-medium text-ember transition hover:text-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
      @click="open"
    >
      <i class="pi pi-plus text-[10px]" aria-hidden="true" />
      Agregar dirección
    </button>

    <p v-else class="font-mono text-[11px] text-steel-400">Sin dirección</p>

    <AddressSheet
      v-if="sheetOpen"
      :address="address"
      :saving="saving"
      :error="saveError"
      @save="save"
      @close="sheetOpen = false"
    />
  </div>
</template>
