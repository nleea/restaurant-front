import 'primeicons/primeicons.css'
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'

import App from './App.vue'
import router from './router'

// "El Pase" identity: PrimeVue's primary becomes the heat-lamp ember so the authenticated
// app inherits the same accent as the login. (Aura's default primary is emerald.)
const Mise = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fef6ec',
      100: '#fce8cf',
      200: '#f9d09f',
      300: '#f6b86f',
      400: '#f4a44a',
      500: '#f2933b',
      600: '#d97a22',
      700: '#b45f17',
      800: '#8f4b16',
      900: '#743f17',
      950: '#421f0a',
    },
  },
})

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: Mise,
    options: {
      darkModeSelector: '.app-dark',
      // Emit PrimeVue styles into a named CSS layer so Tailwind utilities can override.
      cssLayer: { name: 'primevue', order: 'theme, base, primevue' },
    },
  },
})

app.mount('#app')
