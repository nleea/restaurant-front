import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Route is reachable without authentication (login, 403). */
    public?: boolean
    /** Route requires an authenticated session. */
    requiresAuth?: boolean
    /** Permission code required to enter (UX gate only; backend enforces independently). */
    permission?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/payment/delivery/:token',
      name: 'deliveryPayment',
      component: () => import('@/views/DeliveryPaymentView.vue'),
      meta: { public: true },
    },
    {
      path: '/403',
      name: 'forbidden',
      component: () => import('@/views/ForbiddenView.vue'),
      meta: { public: true },
    },
    { path: '/', redirect: { name: 'rbac' } },
    {
      // Public customer storefront: browse the carta + place an order. No auth (reached via QR/link);
      // consumes the tenant's appearance config and wears its theme.
      // `:branchCode?` addresses one branch (branches.code) — the link a customer is handed over
      // WhatsApp. Omitted, it falls back to the tenant's primary branch, so single-branch tenants
      // keep the short /store link unchanged.
      path: '/store/:branchCode?',
      name: 'store',
      component: () => import('@/views/StorefrontView.vue'),
      meta: { public: true },
    },
    {
      // «Mi pedido»: el cliente corrige lo que pidió. El token de la ruta ES la credencial — no
      // hay login detrás y no depende de WhatsApp, así que sirve igual a quien pidió por la web.
      // Público a propósito: exigir sesión aquí sería pedirle cuenta a quien sólo quiere quitar
      // la lechuga.
      path: '/my-order/:token',
      name: 'myOrder',
      component: () => import('@/views/MyOrderView.vue'),
      meta: { public: true },
    },
    // The /kds mock prototype was wired to real data and now lives at /kitchen (pass area).
    { path: '/kds', redirect: { name: 'kitchen' } },
    // The Domicilios map prototype was wired to real data and now lives at /delivery.
    { path: '/delivery-routes', redirect: { name: 'delivery' } },
    {
      path: '/floor',
      name: 'floor',
      component: () => import('@/views/FloorView.vue'),
      meta: { requiresAuth: true, permission: 'orders.read' },
    },
    {
      // The order detail (the Comanda, wired to a real order) as a routed child of the
      // Salón: tap-to-stamp menu field + live dupe + cobro sheet. Deep-linkable; a
      // closed/cancelled/missing order redirects back to /floor.
      path: '/floor/order/:id',
      name: 'order',
      component: () => import('@/views/OrderDetailView.vue'),
      meta: { requiresAuth: true, permission: 'orders.read' },
    },
    {
      // Guarded placeholder; the next change turns this into the RBAC/users screen.
      path: '/rbac',
      name: 'rbac',
      component: () => import('@/views/RbacView.vue'),
      meta: { requiresAuth: true, permission: 'rbac.manage' },
    },
    {
      // The Carta redesign (full-screen recipe costing bench, live food-cost meter) was wired
      // to the real menu store and is now THE menu screen. The old MenuView is retired.
      path: '/menu',
      name: 'menu',
      component: () => import('@/views/CartaView.vue'),
      meta: { requiresAuth: true, permission: 'menu.read' },
    },
    // The redesign used to live at /carta; keep the old path working as a redirect.
    { path: '/carta', redirect: { name: 'menu' } },
    {
      // Admin editor for the public storefront's look (theme, brand, block grid). Configures the
      // customer-facing carta; the storefront itself is a separate surface. Gated by menu.manage.
      path: '/menu/appearance',
      name: 'menu-appearance',
      component: () => import('@/views/MenuAppearanceView.vue'),
      meta: { requiresAuth: true, permission: 'menu.manage' },
    },
    {
      path: '/catalog',
      name: 'catalog',
      component: () => import('@/views/CatalogView.vue'),
      meta: { requiresAuth: true, permission: 'catalog.read' },
    },
    {
      path: '/staff',
      name: 'staff',
      component: () => import('@/views/StaffView.vue'),
      meta: { requiresAuth: true, permission: 'staff.read' },
    },
    {
      // The weekly shift line-up board (admin: reads real shifts, edits schedule).
      path: '/shifts',
      name: 'shifts',
      component: () => import('@/views/ShiftsView.vue'),
      meta: { requiresAuth: true, permission: 'staff.read' },
    },
    {
      // Employee self-view: own weekly schedule + day-off requests. No permission
      // gate — any authenticated employee reaches it (uses the "me" endpoints).
      path: '/my-schedule',
      name: 'my-schedule',
      component: () => import('@/views/MyScheduleView.vue'),
      meta: { requiresAuth: true },
    },
    // The standalone "Comandas" screen was replaced by the Salón floor; keep the old
    // path working as a redirect.
    { path: '/orders', redirect: { name: 'floor' } },
    // The Comanda redesign became the real order screen at /floor/order/:id; the old
    // in-memory prototype route redirects to the Salón.
    { path: '/comanda', redirect: { name: 'floor' } },
    {
      path: '/kitchen',
      name: 'kitchen',
      component: () => import('@/views/KitchenView.vue'),
      meta: { requiresAuth: true, permission: 'kitchen.read' },
    },
    {
      // The Caja redesign was wired to real data and is now THE cash screen.
      path: '/cash',
      name: 'cash',
      component: () => import('@/views/CashStationView.vue'),
      meta: { requiresAuth: true, permission: 'cash.read' },
    },
    // The redesign used to live at /cash/station; keep the old path working.
    { path: '/cash/station', redirect: { name: 'cash' } },
    {
      // The inventory board (stats/filters · table/cards · detail drawer).
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
      meta: { requiresAuth: true, permission: 'inventory.read' },
    },
    // The board replaced the old two-column screen; the design-prototype URL redirects home.
    { path: '/inventory/design', redirect: { name: 'inventory' } },
    {
      path: '/purchasing',
      name: 'purchasing',
      component: () => import('@/views/PurchasingView.vue'),
      meta: { requiresAuth: true, permission: 'purchasing.read' },
    },
    // The procure-to-pay screen was folded into the Compras board; the old route redirects.
    { path: '/procurement', redirect: { name: 'purchasing' } },
    {
      // Consolidated Finanzas: the six-tab module (Resumen, Ingresos, Gastos,
      // Rentabilidad, Reporte Z, Reportes). The old expenses-only view is now the
      // Gastos tab, so `/finance/z` redirects here and there is one sidebar entry.
      path: '/finance',
      name: 'finance',
      component: () => import('@/views/FinanceZReportView.vue'),
      meta: { requiresAuth: true, permission: 'finance.read' },
    },
    { path: '/finance/z', redirect: { name: 'finance' } },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('@/views/CustomersView.vue'),
      meta: { requiresAuth: true, permission: 'customers.read' },
    },
    {
      // The coverage map (routes, rings, drivers). The per-order lifecycle stays at /dispatch.
      path: '/delivery',
      name: 'delivery',
      component: () => import('@/views/DeliveryRoutesView.vue'),
      meta: { requiresAuth: true, permission: 'delivery.read' },
    },
    {
      // The shared WhatsApp inbox, scoped to the active branch.
      path: '/whatsapp',
      name: 'whatsapp-inbox',
      component: () => import('@/views/WhatsAppInboxView.vue'),
      meta: { requiresAuth: true, permission: 'messaging.read' },
    },
    {
      // One number per branch: pairing and connection status.
      path: '/whatsapp/sessions',
      name: 'whatsapp-sessions',
      component: () => import('@/views/WhatsAppSessionsView.vue'),
      meta: { requiresAuth: true, permission: 'messaging.manage' },
    },
    {
      // What the number answers on its own: greeting, order notices, link lifetime. Editing
      // it changes what every customer of every branch is told, so it is `messaging.manage`
      // — attending a conversation must not let anyone rewrite the greeting.
      path: '/whatsapp/autoreply',
      name: 'whatsapp-autoreply',
      component: () => import('@/views/WhatsAppAutoreplyView.vue'),
      meta: { requiresAuth: true, permission: 'messaging.manage' },
    },
    {
      // The dispatch board (three-pane: stats/filters · list · detail).
      path: '/dispatch',
      name: 'dispatch',
      component: () => import('@/views/DispatchView.vue'),
      meta: { requiresAuth: true, permission: 'delivery.read' },
    },
    {
      // The driver's ("domiciliario") own mobile view: my run, my map, my day. Full-screen
      // mobile experience (no AppShell); reads only its own work, never assigns. Gated by
      // `delivery.drive` (the courier permission), independent of the dispatcher's read/assign.
      path: '/driver',
      name: 'driver',
      component: () => import('@/views/DriverView.vue'),
      meta: { requiresAuth: true, permission: 'delivery.drive' },
    },
    // The board replaced the old two-column screen; the design-prototype URL redirects home.
    { path: '/dispatch/design', redirect: { name: 'dispatch' } },
    {
      // Lo que está encendido en la sucursal activa. Ver y TOMAR es el turno, así que las
      // dos cosas van con `alerts.read`; configurar vive aparte.
      path: '/alerts',
      name: 'alerts',
      component: () => import('@/views/AlertsView.vue'),
      meta: { requiresAuth: true, permission: 'alerts.read' },
    },
    {
      // Umbrales, colchones y a quién se le escribe a las once de la noche: el dueño.
      path: '/alerts/rules',
      name: 'alerts-rules',
      component: () => import('@/views/AlertRulesView.vue'),
      meta: { requiresAuth: true, permission: 'alerts.manage' },
    },
    {
      // Preguntar es del turno; ver lo que cuesta y comprar más es del dueño.
      path: '/assistant',
      name: 'assistant',
      component: () => import('@/views/AssistantView.vue'),
      meta: { requiresAuth: true, permission: 'assistant.use' },
    },
    {
      path: '/assistant/usage',
      name: 'assistant-usage',
      component: () => import('@/views/AssistantUsageView.vue'),
      meta: { requiresAuth: true, permission: 'assistant.manage' },
    },
    {
      path: '/audit',
      name: 'audit',
      component: () => import('@/views/AuditView.vue'),
      meta: { requiresAuth: true, permission: 'audit.read' },
    },
    {
      // Admin editor for the tenant's identity + branches (address/phone + weekly hours).
      // Reads are open, but every save requires menu.manage (backend enforces independently).
      path: '/business',
      name: 'business',
      component: () => import('@/views/BusinessProfileView.vue'),
      meta: { requiresAuth: true, permission: 'menu.manage' },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) return true

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // F5 race: a token is present but identity isn't hydrated yet. Confirm before deciding.
  if (auth.isAuthenticated && !auth.user) {
    await auth.bootstrap()
    if (!auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
  }

  const required = to.meta.permission
  if (required && !auth.can(required)) {
    return { name: 'forbidden' }
  }

  return true
})

export default router
