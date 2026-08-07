<script setup lang="ts">
// "Alertas": lo que el sistema sabe y nadie te ha dicho.
//
// La pantalla más importante de este módulo es la VACÍA. Un panel de alertas que casi
// siempre tiene cosas es un panel que nadie mira, así que el estado "todo en orden" se trata
// como una respuesta de primera —con su propio diseño— y no como una lista sin filas.
//
// El panel NO dispara nada: si una alerta apareciera al abrir la pantalla, sería una alerta
// que no existe cuando nadie mira, que es justo al revés de para lo que sirve el módulo.
// Disparar es del worker; aquí sólo se ve y se toma.
import { computed, onMounted, onUnmounted, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import AlertCard from '@/components/alerts/AlertCard.vue'
import { useBrowserNotifications } from '@/composables/useBrowserNotifications'
import { RULE_LABEL } from '@/lib/alerts'
import { useAlertsStore } from '@/stores/alerts'
import { useAuthStore } from '@/stores/auth'
import { useBranchStore } from '@/stores/branch'

const alerts = useAlertsStore()
const branch = useBranchStore()
const auth = useAuthStore()

const canManage = computed(() => auth.can('alerts.manage'))
const busy = computed(() => alerts.loading)

/** Tomadas al fondo: lo que nadie ha cogido es lo que hay que mirar. */
const ordered = computed(() =>
  [...alerts.alerts].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'fired' ? -1 : 1
    return (b.fired_at ?? '').localeCompare(a.fired_at ?? '')
  }),
)

// --- Avisos fuera de la pestaña ---------------------------------------------
// Durante un servicio nadie tiene esta pantalla abierta: están en Caja, en Comandas o en el KDS.
// Sin esto, los recordatorios cada cinco minutos insisten donde no hay nadie mirando.
const notifications = useBrowserNotifications()

/** Lo que hay que avisar de una alerta: quién es y de qué va. */
function notifiable(alert: (typeof alerts.alerts)[number]) {
  return {
    id: alert.id,
    title: alert.subject_label ?? alert.subject_ref,
    body: RULE_LABEL[alert.rule_key],
  }
}

/**
 * Avisa de lo que sea NUEVO desde el último refresco.
 *
 * El transporte lleva la cuenta de lo ya avisado; aquí sólo se le pasa lo abierto. Lo que
 * evita reproducir alertas viejas es la siembra del arranque, no un filtro de esta función.
 */
function announce(): void {
  alerts.alerts
    .filter((a) => a.status === 'fired')
    .forEach((a) => notifications.notify(notifiable(a)))
  notifications.setBadge(alerts.unacknowledgedCount)
}

async function start(branchId: string): Promise<void> {
  await alerts.load(branchId)
  // Se siembra ANTES de escuchar: entrar al panel con tres alertas de anoche no puede disparar
  // tres notificaciones de escritorio. Quien las reciba las apaga para siempre.
  notifications.seed(alerts.alerts.map((a) => a.id))
  notifications.setBadge(alerts.unacknowledgedCount)
  alerts.startLive(branchId)
}

// El timbre de realtime refresca la lista; esto convierte lo nuevo en un aviso visible fuera.
watch(() => alerts.alerts.map((a) => a.id).join('|'), announce)

async function toggleNotifications(): Promise<void> {
  if (notifications.enabled.value) notifications.disable()
  else await notifications.enable()
}

onMounted(async () => {
  await branch.ensureLoaded()
  if (branch.activeBranchId) await start(branch.activeBranchId)
})

// Cambiar de sucursal es una recarga, no un filtro: una alerta pertenece a una cocina.
watch(
  () => branch.activeBranchId,
  (id) => {
    if (id) void start(id)
  },
)

onUnmounted(() => {
  alerts.stopLive()
  // El contador es del título de la pestaña, no de esta vista: salir del panel lo limpia.
  notifications.setBadge(0)
})
</script>

<template>
  <AppShell>
    <main class="min-h-screen">
      <div class="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
        <header class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500">
              Estación · Alertas
            </p>
            <h1 class="mt-1 text-2xl font-extrabold text-ink">Qué necesita atención</h1>
            <p class="text-steel-500">
              Lo que el sistema ya sabe y nadie te había dicho.
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              :disabled="!notifications.supported || notifications.blocked.value"
              data-testid="toggle-notifications"
              class="rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition disabled:opacity-40"
              :class="
                notifications.active.value
                  ? 'border-ember/50 text-ember-600'
                  : 'border-line text-steel-500 hover:border-ember/50 hover:text-ember-600'
              "
              @click="toggleNotifications"
            >
              <i
                class="pi mr-1 text-[10px]"
                :class="notifications.active.value ? 'pi-bell' : 'pi-bell-slash'"
              />
              Avisos
            </button>
            <button
              v-if="notifications.active.value"
              type="button"
              data-testid="toggle-sound"
              class="rounded-lg border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition"
              :class="
                notifications.soundOn.value
                  ? 'border-ember/50 text-ember-600'
                  : 'border-line text-steel-500 hover:border-ember/50 hover:text-ember-600'
              "
              @click="notifications.setSound(!notifications.soundOn.value)"
            >
              <i
                class="pi mr-1 text-[10px]"
                :class="notifications.soundOn.value ? 'pi-volume-up' : 'pi-volume-off'"
              />
              Sonido
            </button>
          </div>
          <RouterLink
            v-if="canManage"
            to="/alerts/rules"
            class="shrink-0 rounded-lg border border-line px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-steel-500 transition hover:border-ember/50 hover:text-ember-600"
          >
            Configurar
          </RouterLink>
        </header>

        <!-- La limitación se dice ANTES de que alguien la descubra: sin una pestaña abierta no
             llega nada. Prometerlo y fallar es peor que no ofrecerlo. -->
        <p
          class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-500"
          data-testid="notifications-help"
        >
          <template v-if="!notifications.supported">
            Este navegador no sabe mostrar avisos del sistema. El contador de la pestaña y este
            panel siguen funcionando igual.
          </template>
          <template v-else-if="notifications.blocked.value">
            <strong class="text-warn">El navegador tiene bloqueados los avisos</strong> para esta
            página. Se vuelven a permitir desde los ajustes del navegador, no desde aquí.
          </template>
          <template v-else-if="notifications.active.value">
            Te avisamos aunque estés en otra pestaña — pero hace falta que
            <strong>quede abierta una pestaña</strong> de la app. Con el navegador cerrado sólo
            llega el WhatsApp, si la regla lo tiene encendido.
          </template>
          <template v-else>
            Enciende <strong>Avisos</strong> y te avisamos aunque estés en Caja o en Comandas.
            Hace falta que quede abierta una pestaña de la app.
          </template>
        </p>

        <p
          v-if="alerts.error"
          role="alert"
          class="rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs text-alert"
          data-testid="error"
        >
          {{ alerts.error }}
        </p>

        <!-- Perder la carrera es información: quién la tiene, no "error". -->
        <p
          v-if="alerts.claimConflict"
          role="status"
          class="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-xs text-warn"
          data-testid="claim-conflict"
        >
          {{ alerts.claimConflict.message }}
        </p>

        <p v-if="alerts.loading" class="font-mono text-[11px] text-steel-500">Cargando…</p>

        <!-- El estado que más se va a ver, y el que más importa que se lea bien. -->
        <div
          v-else-if="alerts.allClear"
          class="rounded-xl border border-line bg-paper px-6 py-12 text-center"
          data-testid="all-clear"
        >
          <span class="grid mx-auto size-12 place-items-center rounded-full bg-success/10">
            <i class="pi pi-check text-success" />
          </span>
          <p class="mt-3 font-display text-lg font-extrabold text-ink">Todo en orden</p>
          <p class="mt-1 text-sm text-steel-500">
            Nada que atender en esta sucursal. Si algo se enciende, aparece aquí solo.
          </p>
        </div>

        <ul v-else class="flex flex-col gap-3">
          <AlertCard
            v-for="alert in ordered"
            :key="alert.id"
            :alert="alert"
            :subject-label="alert.subject_label ?? undefined"
            :busy="busy"
            @acknowledge="alerts.acknowledge($event)"
            @mute="alerts.mute($event)"
          />
        </ul>

        <!-- Sin esto, "Ya lo sé" se lee como "apagar la regla" y nadie lo pulsa. Va en la
             pantalla y no en un tooltip por tarjeta: esto se usa en una tablet, con el dedo, y
             ahí un `title` no existe. -->
        <p
          v-if="ordered.length"
          class="rounded-lg border border-line bg-app px-3 py-2 font-mono text-[10px] leading-relaxed text-steel-500"
          data-testid="mute-help"
        >
          <strong class="text-steel-400">Me encargo</strong> dice que alguien se hace cargo y lo
          deja anotado. <strong class="text-steel-400">Ya lo sé</strong> sólo deja de recordarte
          <strong>esa</strong> alerta, sin apuntar a nadie y sin apagar la regla: cuando se
          resuelva y vuelva a pasar, te avisa otra vez.
        </p>


        <p class="font-mono text-[11px] leading-relaxed text-steel-400">
          Las alertas las levanta un vigilante que corre aparte, así que aparecen aunque nadie
          tenga esta pantalla abierta. Tomar una no la resuelve: deja de avisar y dice quién
          se está encargando.
        </p>
      </div>
    </main>
  </AppShell>
</template>
