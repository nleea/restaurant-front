<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AxiosError } from 'axios'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref<string | null>(null)
const loading = ref(false)

// The tenant is resolved by the Host subdomain; surfacing it makes the docket header true,
// not decorative: this login belongs to exactly one tenant.
const tenantSlug = computed(() => {
  const first = window.location.hostname.split('.')[0] ?? ''
  return first && first !== 'localhost' ? first : '—'
})

async function onSubmit() {
  error.value = null
  loading.value = true
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value =
      e instanceof AxiosError && e.response?.status === 401
        ? 'Credenciales inválidas. Revisa el correo y la contraseña.'
        : 'Sin conexión con el servidor. Verifica que la API esté arriba.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="bg-pass min-h-screen grid place-items-center px-4 py-12">
    <div class="animate-docket w-full max-w-sm">
      <!-- The docket: a kitchen ticket on the rail -->
      <form
        class="overflow-hidden rounded-2xl bg-paper shadow-[0_24px_60px_-24px_rgb(0_0_0/0.55)] ring-1 ring-black/5"
        novalidate
        @submit.prevent="onSubmit"
      >
        <div class="docket-perf h-2 w-full"></div>

        <div class="px-7 pb-7 pt-5">
          <!-- Ticket header: tenant slug (live, from subdomain) + docket number -->
          <div
            class="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-steel-500"
          >
            <span>Servicio · {{ tenantSlug }}</span>
            <span class="text-ember">#0001</span>
          </div>

          <hr class="my-4 border-line" />

          <h1 class="text-2xl font-extrabold leading-tight text-ink">Iniciar sesión</h1>
          <p class="mt-1 text-sm text-steel-500">Tu operación, bajo control.</p>

          <p
            v-if="error"
            role="alert"
            class="mt-5 rounded-lg border border-alert/30 bg-alert/5 px-3 py-2 font-mono text-xs leading-relaxed text-alert"
          >
            {{ error }}
          </p>

          <div class="mt-6 flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <label for="email" class="text-xs font-medium uppercase tracking-wide text-steel-500">
                Correo
              </label>
              <input
                id="email"
                v-model="email"
                type="email"
                autocomplete="username"
                required
                placeholder="tu@restaurante.com"
                class="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-ink outline-none transition placeholder:text-steel-500/50 focus-visible:border-ember focus-visible:ring-2 focus-visible:ring-ember/25"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label
                for="password"
                class="text-xs font-medium uppercase tracking-wide text-steel-500"
              >
                Contraseña
              </label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                  class="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 pr-11 text-ink outline-none transition focus-visible:border-ember focus-visible:ring-2 focus-visible:ring-ember/25"
                />
                <button
                  type="button"
                  :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                  :aria-pressed="showPassword"
                  class="absolute inset-y-0 right-0 grid w-11 place-items-center text-steel-500 transition hover:text-ink focus-visible:text-ember focus-visible:outline-none"
                  @click="showPassword = !showPassword"
                >
                  <svg
                    v-if="showPassword"
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                  </svg>
                  <svg
                    v-else
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-ember px-4 py-2.5 font-display font-semibold text-graphite-900 transition hover:bg-ember-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                v-if="loading"
                class="h-4 w-4 animate-spin rounded-full border-2 border-graphite-900/30 border-t-graphite-900"
                aria-hidden="true"
              ></span>
              {{ loading ? 'Entrando…' : 'Entrar al servicio' }}
            </button>
          </div>
        </div>
      </form>

      <p class="mt-5 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-steel-500">
        mise · puesto de control
      </p>
    </div>
  </main>
</template>
