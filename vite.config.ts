import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Tenant is resolved by the Host subdomain (e.g. demo.localhost). The browser maps
    // *.localhost to 127.0.0.1 on its own; Vite just needs to accept those hosts.
    host: true,
    port: 5173,
    allowedHosts: ['.localhost'],
  },
})
