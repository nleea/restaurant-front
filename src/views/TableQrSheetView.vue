<script setup lang="ts">
// La hoja de QR de las mesas: la pantalla desde la que un dueño de restaurante imprime las
// calcomanías y las pega. Última pieza del pedido por QR — sin papel, la capacidad no existe.
//
// Dos decisiones mandan sobre el diseño, y las dos salen de lo mismo: esto se IMPRIME.
//
// 1. La URL se enseña DEBAJO de cada QR, en texto legible. Un QR es opaco: si la única forma de
//    saber a dónde apunta fuera escanearlo, nadie revisaría nada antes de mandar diez a la
//    imprenta. Un enlace de WhatsApp equivocado se corrige mandando otro; una calcomanía
//    equivocada hay que despegarla de diez mesas.
// 2. La URL la construye el BACKEND y llega hecha. Esta pantalla no la arma nunca: la forma del
//    enlace público vive en un solo sitio, y dos sitios que la construyan es exactamente el
//    papel que discrepa del router.
import { computed, onMounted, ref, watch } from 'vue'
import * as orders from '@/services/orders.api'
import { useBranchStore } from '@/stores/branch'

const branch = useBranchStore()

interface Sticker {
  tableId: string
  number: string
  url: string
  svg: string
}

const stickers = ref<Sticker[]>([])
const loading = ref(false)
// Lo que impidió generar los QR, ya en palabras. El caso importante es "falta el dominio
// público": el backend responde 422 antes que dar un QR que lleva a ninguna parte, y aquí hay
// que decirle a quién le toca arreglarlo, no enseñar un código de error.
const problem = ref('')

const branchName = computed(() => branch.activeBranch?.name ?? '')

async function load() {
  const branchId = branch.activeBranchId
  if (!branchId) return
  loading.value = true
  problem.value = ''
  stickers.value = []
  try {
    const tables = (await orders.listTables(branchId))
      .filter((t) => t.is_active)
      // Orden natural de mesa: "10" va después de "9", no entre "1" y "2".
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

    const built: Sticker[] = []
    for (const table of tables) {
      const qr = await orders.getTableQr(table.id)
      built.push({ tableId: table.id, number: table.number, url: qr.url, svg: qr.svg })
    }
    stickers.value = built
    if (!built.length) {
      problem.value = 'Esta sucursal no tiene mesas activas. Créalas en el Salón y vuelve aquí.'
    }
  } catch (err: unknown) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    problem.value =
      detail && detail.includes('STOREFRONT_BASE_URL')
        ? 'Falta configurar el dominio público de la carta en el servidor (STOREFRONT_BASE_URL). ' +
          'Sin él, el QR llevaría a ninguna parte, así que no se genera ninguno.'
        : (detail ?? 'No pudimos generar los códigos. Inténtalo otra vez.')
  } finally {
    loading.value = false
  }
}

function print() {
  window.print()
}

onMounted(load)
// La sede va en la URL de cada QR, así que cambiar de sucursal invalida la hoja entera.
watch(() => branch.activeBranchId, load)
</script>

<template>
  <section class="mx-auto max-w-5xl px-4 py-6">
    <header class="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-extrabold text-ink">QR de las mesas</h1>
        <p class="mt-1 text-sm text-steel-500">
          Imprime, recorta y pega uno en cada mesa. El cliente lo escanea y pide desde su
          teléfono.
          <span v-if="branchName"> · {{ branchName }}</span>
        </p>
      </div>
      <button
        type="button"
        class="rounded-lg bg-ember px-4 py-2 font-semibold text-white disabled:opacity-40"
        data-testid="print"
        :disabled="!stickers.length"
        @click="print"
      >
        <i class="pi pi-print mr-2 text-xs" />Imprimir
      </button>
    </header>

    <p v-if="loading" class="no-print text-sm text-steel-500" data-testid="loading">
      Generando los códigos…
    </p>

    <p
      v-else-if="problem"
      class="no-print rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink"
      data-testid="problem"
    >
      {{ problem }}
    </p>

    <!-- Una tarjeta por mesa. `break-inside-avoid` evita que un QR quede partido entre dos
         hojas, que es la única forma de imprimir algo inservible sin notarlo. -->
    <div v-else class="grid grid-cols-2 gap-6 sm:grid-cols-3">
      <article
        v-for="s in stickers"
        :key="s.tableId"
        class="break-inside-avoid rounded-xl border border-line bg-white p-4 text-center"
        data-testid="sticker"
      >
        <h2 class="font-display text-xl font-extrabold text-ink">Mesa {{ s.number }}</h2>
        <!-- El SVG llega del backend, generado por `segno`: no es entrada de usuario. -->
        <div class="qr mx-auto mt-2" v-html="s.svg" />
        <p class="mt-2 text-[11px] text-steel-500">Escanea para ver la carta y pedir</p>
        <!-- La comprobación humana antes de gastar papel. -->
        <p class="mt-1 break-all font-mono text-[9px] text-steel-500" data-testid="sticker-url">
          {{ s.url }}
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.qr :deep(svg) {
  width: 100%;
  max-width: 180px;
  height: auto;
}

@media print {
  .no-print {
    display: none !important;
  }
  /* Sin sombras ni bordes de pantalla: lo que se recorta es la tarjeta, y una línea impresa
     ayuda a cortar recto. */
  article {
    border-color: #cbd5e1;
  }
}
</style>
