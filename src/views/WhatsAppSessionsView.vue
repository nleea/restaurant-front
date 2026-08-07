<script setup lang="ts">
// One WhatsApp number per branch, and whether it is actually receiving.
//
// The screen's job is to make a MUTE branch impossible to miss: a disconnected number looks
// like an outage, not like a settings row, because until change 3 adds an alert this page is
// the only place anyone would notice that a branch has stopped hearing its customers.
import { computed, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { useBranchStore } from '@/stores/branch'
import { useMessagingStore } from '@/stores/messaging'
import type { SessionStatus } from '@/services/messaging.api'

const branch = useBranchStore()
const messaging = useMessagingStore()

const pairingId = ref<string | null>(null)
const newRef = ref<Record<string, string>>({})
const formError = ref<string | null>(null)

onMounted(async () => {
  await branch.ensureLoaded()
  await messaging.loadSessions()
})

/** One row per branch, whether or not it has a session yet — a branch with no number is the
 *  most important row on the page, and filtering by existing sessions would hide it. */
const rows = computed(() =>
  branch.branches.map((b) => ({
    branch: b,
    session: messaging.sessionOf(b.id),
  })),
)

const STATUS_COPY: Record<SessionStatus, string> = {
  connected: 'Recibiendo mensajes',
  qr_pending: 'Esperando escaneo del QR',
  disconnected: 'No está recibiendo mensajes',
  banned: 'Número bloqueado por WhatsApp',
}

function statusTone(status: SessionStatus | undefined): string {
  if (status === 'connected') return 'text-ember-600'
  if (status === 'qr_pending') return 'text-warn'
  return 'text-alert'
}

async function pair(sessionId: string) {
  pairingId.value = sessionId
  await messaging.startPairing(sessionId)
}

async function create(branchId: string) {
  const ref_ = (newRef.value[branchId] ?? '').trim()
  if (!ref_) return
  formError.value = null
  try {
    await messaging.createSession(branchId, ref_)
    newRef.value[branchId] = ''
  } catch {
    formError.value = 'No se pudo crear la sesión. ¿La referencia ya está en uso?'
  }
}

const lastSeen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="min-w-0">
          <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
            Estación · WhatsApp
          </p>
          <h1 class="mt-1 text-2xl font-extrabold text-ink">Números por sucursal</h1>
          <p class="text-steel-500">
            Cada sucursal atiende su propio número. El cliente elige la sede al elegir a quién
            le escribe.
          </p>
        </header>

        <p
          v-if="messaging.error || formError"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
        >
          {{ formError ?? messaging.error }}
        </p>

        <!-- Sin esto, el síntoma —"a mis compañeros les salen las palomitas y a mí no"— es
             indistinguible de un fallo, y nadie va a adivinar que la cura es un botón que parece
             peligroso. Se dice también que no desconecta, porque ése es el miedo que frena. -->
        <p
          class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-500"
          data-testid="receipts-notice"
        >
          <strong class="text-steel-400">¿No ves si tus mensajes se entregaron o se leyeron?</strong>
          Los números vinculados antes de esta versión no reportan las palomitas hasta que se
          vuelvan a vincular. Pulsa <em>Volver a vincular</em>: no desconecta el número ni pide
          escanear nada si ya está conectado.
        </p>

        <p v-if="messaging.loading" class="font-mono text-[11px] text-steel-500">Cargando…</p>

        <ul v-else class="flex flex-col gap-3">
          <li
            v-for="row in rows"
            :key="row.branch.id"
            class="rounded-xl border bg-paper p-4"
            :class="
              row.session?.status === 'connected'
                ? 'border-line'
                : 'border-alert/40 ring-1 ring-alert/10'
            "
            :data-branch="row.branch.id"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="truncate font-display text-base font-extrabold text-ink">
                  {{ row.branch.name }}
                </h2>
                <p
                  class="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em]"
                  :class="statusTone(row.session?.status)"
                >
                  {{
                    row.session
                      ? STATUS_COPY[row.session.status]
                      : 'Sin número vinculado — no recibe mensajes'
                  }}
                </p>
                <p v-if="row.session" class="mt-1 font-mono text-[11px] text-steel-500">
                  {{ row.session.phone_number ?? 'número aún desconocido' }}
                  <span class="text-steel-400">· visto {{ lastSeen(row.session.last_seen_at) }}</span>
                </p>
              </div>

              <div class="flex shrink-0 items-center gap-2">
                <button
                  v-if="row.session && row.session.status !== 'banned'"
                  type="button"
                  class="rounded-lg bg-ember px-3 py-1.5 text-sm font-medium text-white transition hover:bg-ember-600"
                  @click="pair(row.session.id)"
                >
                  {{ row.session.status === 'connected' ? 'Volver a vincular' : 'Vincular' }}
                </button>
              </div>
            </div>

            <!-- El QR llega con la respuesta de vincular y sólo vive en memoria: es de un
                 solo uso y caduca en segundos. Guardarlo mostraría mañana un código muerto. -->
            <div
              v-if="row.session && row.session.status === 'qr_pending'"
              class="mt-3 rounded-lg border border-dashed border-ember/40 bg-ember-50/60 p-4 text-center"
              data-qr-panel
            >
              <p class="font-mono text-[11px] uppercase tracking-[0.14em] text-ember-600">
                Escanea el QR desde WhatsApp
              </p>
              <img
                v-if="messaging.qrBySession[row.session.id]"
                :src="messaging.qrBySession[row.session.id]!"
                alt="Código QR para vincular este número de WhatsApp"
                class="mx-auto mt-2 size-48 rounded-lg border border-line bg-white p-1"
                data-qr
              />
              <div
                v-else
                class="mx-auto mt-2 grid size-48 place-items-center rounded-lg border border-line bg-paper"
              >
                <span class="px-4 text-center font-mono text-[10px] leading-snug text-steel-400">
                  El QR caduca en segundos.<br />Pulsa "Vincular" para pedir uno nuevo.
                </span>
              </div>
              <p class="mt-2 font-mono text-[10px] leading-relaxed text-steel-500">
                WhatsApp › Dispositivos vinculados › Vincular dispositivo<br />
                Instancia: {{ row.session.provider_instance_ref }}
              </p>
            </div>

            <!-- A branch with no session at all -->
            <form
              v-if="!row.session"
              class="mt-3 flex flex-wrap items-end gap-2"
              @submit.prevent="create(row.branch.id)"
            >
              <div class="flex min-w-[12rem] flex-1 flex-col gap-1">
                <label
                  :for="`ref-${row.branch.id}`"
                  class="font-mono text-[10px] uppercase tracking-[0.14em] text-steel-500"
                >
                  Referencia de instancia del puente
                </label>
                <input
                  :id="`ref-${row.branch.id}`"
                  v-model="newRef[row.branch.id]"
                  type="text"
                  placeholder="p. ej. centro-01"
                  class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-ember/60"
                />
              </div>
              <button
                type="submit"
                class="rounded-lg border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
              >
                Crear sesión
              </button>
            </form>
          </li>
        </ul>

        <p class="font-mono text-[11px] leading-relaxed text-steel-400">
          Las credenciales del número viven en el puente, nunca aquí. Si el puente pierde su
          estado, todas las sucursales tendrán que volver a escanear su QR.
        </p>
      </div>
    </main>
  </AppShell>
</template>
