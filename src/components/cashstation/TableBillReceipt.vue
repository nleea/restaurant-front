<script setup lang="ts">
// La tirilla de una mesa: el papel que se le entrega al cliente.
//
// Dice, con todas las letras, que NO es una factura electrónica. En Colombia un papel con
// nombre del negocio, NIT y total se parece muchísimo a un documento fiscal y no lo es; un papel
// que se parece a una factura sin serlo es peor que uno que dice lo que es. El día que entre la
// facturación electrónica, esa frase es lo que se sustituye por el CUFE y su QR — el sitio ya
// está.
//
// Los datos llegan JUNTOS del servidor. No se componen aquí: un papel incompleto no falla, sale
// impreso y nadie se entera hasta que alguien lo mira.
import { onMounted, ref } from 'vue'
import { cop } from '@/lib/cop'
import * as ordersApi from '@/services/orders.api'
import type { BillReceipt } from '@/services/orders.api'

const props = defineProps<{ billId: string; employeeId: string | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const receipt = ref<BillReceipt | null>(null)
const problem = ref('')
const reprint = ref(false)

const METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  nequi: 'Nequi',
}

onMounted(async () => {
  try {
    receipt.value = await ordersApi.getBillReceipt(props.billId)
  } catch {
    problem.value = 'No pudimos preparar la tirilla.'
  }
})

async function print() {
  // Se REGISTRA antes de abrir el diálogo del navegador: si el cajero cancela la impresión, la
  // auditoría dirá que se intentó, que es más honesto que no decir nada. Una segunda vez queda
  // marcada como reimpresión, que es justo lo que esa auditoría existe para vigilar.
  if (props.employeeId) {
    try {
      const recorded = await ordersApi.recordBillReceipt(props.billId, props.employeeId)
      reprint.value = recorded.is_reprint
    } catch {
      /* registrar la impresión no puede impedir imprimir */
    }
  }
  window.print()
}
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
    <div class="max-h-[90dvh] w-full max-w-sm overflow-auto rounded-2xl bg-white p-5">
      <p v-if="problem" data-testid="receipt-problem" class="text-sm">{{ problem }}</p>

      <article v-else-if="receipt" class="receipt font-mono text-[12px] leading-snug text-black">
        <header class="text-center">
          <p class="text-[14px] font-bold">{{ receipt.business_name }}</p>
          <p v-if="receipt.tax_id" data-testid="tax-id">NIT {{ receipt.tax_id }}</p>
          <p v-if="receipt.business_address">{{ receipt.business_address }}</p>
          <p>{{ receipt.branch_name }}</p>
        </header>

        <hr class="my-2 border-dashed border-black/40" />

        <p class="flex justify-between">
          <span>Mesa {{ receipt.table_number }}</span>
          <span v-if="receipt.closed_at">{{ new Date(receipt.closed_at).toLocaleString('es-CO') }}</span>
        </p>

        <section v-for="m in receipt.members" :key="m.order_id" class="mt-3" data-testid="receipt-member">
          <p class="font-bold">{{ m.diner_name || 'Comanda' }} · {{ m.order_label }}</p>
          <p v-for="(line, i) in m.lines" :key="i" class="flex justify-between">
            <span>{{ line.quantity }}× {{ line.name }}</span>
            <span class="tabular-nums">{{ cop(Number(line.line_subtotal)) }}</span>
          </p>
          <p class="flex justify-between border-t border-dashed border-black/20">
            <span>Subtotal</span>
            <span class="tabular-nums">{{ cop(Number(m.total)) }}</span>
          </p>
        </section>

        <hr class="my-2 border-dashed border-black/40" />

        <p class="flex justify-between text-[14px] font-bold">
          <span>TOTAL</span>
          <span class="tabular-nums" data-testid="receipt-total">{{ cop(Number(receipt.total)) }}</span>
        </p>
        <p v-if="receipt.methods.length" class="mt-1">
          Pagado con: {{ receipt.methods.map((m) => METHOD_LABELS[m] ?? m).join(' · ') }}
        </p>

        <p v-if="reprint" class="mt-2 text-center font-bold" data-testid="reprint-mark">** REIMPRESIÓN **</p>

        <!-- La frase. Va aquí, en el papel, no en la pantalla: quien tiene que leerla es quien
             se lleva el documento. -->
        <p class="mt-3 text-center text-[10px]" data-testid="not-an-invoice">
          Este documento NO es una factura electrónica.
        </p>
      </article>

      <div class="no-print mt-4 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-lg bg-ember px-4 py-2 font-semibold text-white disabled:opacity-40"
          data-testid="print-receipt"
          :disabled="!receipt"
          @click="print"
        >
          Imprimir
        </button>
        <button type="button" class="rounded-lg border border-line px-4 py-2 text-sm" data-testid="close-receipt" @click="emit('close')">
          Cerrar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  .no-print {
    display: none !important;
  }
}
</style>
