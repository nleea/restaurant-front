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
    // `.wsquote.uk` está aquí para el túnel de Cloudflare, que reenvía el Host real.
    host: true,
    port: 5173,
    allowedHosts: ['.localhost', '.wsquote.uk'],
    proxy: {
      // `/api` en el mismo origen también en desarrollo, para que la app no aprenda dos
      // formas distintas. OJO: `changeOrigin` se queda en false A PROPÓSITO — el backend
      // lee el tenant de la cabecera Host, y reescribirla a `localhost` borraría el
      // subdominio y devolvería 400 "Subdominio de tenant requerido" en cada petición.
      '/api': { target: 'http://localhost:8000', changeOrigin: false },
    },
  },
})
