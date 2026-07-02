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
      path: '/403',
      name: 'forbidden',
      component: () => import('@/views/ForbiddenView.vue'),
      meta: { public: true },
    },
    { path: '/', redirect: { name: 'rbac' } },
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
      // Guarded placeholder; the next change turns this into the RBAC/users screen.
      path: '/rbac',
      name: 'rbac',
      component: () => import('@/views/RbacView.vue'),
      meta: { requiresAuth: true, permission: 'rbac.manage' },
    },
    {
      path: '/menu',
      name: 'menu',
      component: () => import('@/views/MenuView.vue'),
      meta: { requiresAuth: true, permission: 'menu.read' },
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
    // The standalone "Comandas" screen was replaced by the Salón floor; keep the old
    // path working as a redirect.
    { path: '/orders', redirect: { name: 'floor' } },
    {
      path: '/kitchen',
      name: 'kitchen',
      component: () => import('@/views/KitchenView.vue'),
      meta: { requiresAuth: true, permission: 'kitchen.read' },
    },
    {
      path: '/cash',
      name: 'cash',
      component: () => import('@/views/CashView.vue'),
      meta: { requiresAuth: true, permission: 'cash.read' },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
      meta: { requiresAuth: true, permission: 'inventory.read' },
    },
    {
      path: '/purchasing',
      name: 'purchasing',
      component: () => import('@/views/PurchasingView.vue'),
      meta: { requiresAuth: true, permission: 'purchasing.read' },
    },
    {
      path: '/procurement',
      name: 'procurement',
      component: () => import('@/views/ProcurementView.vue'),
      meta: { requiresAuth: true, permission: 'purchasing.read' },
    },
    {
      path: '/finance',
      name: 'finance',
      component: () => import('@/views/FinanceView.vue'),
      meta: { requiresAuth: true, permission: 'finance.read' },
    },
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
      path: '/dispatch',
      name: 'dispatch',
      component: () => import('@/views/DispatchView.vue'),
      meta: { requiresAuth: true, permission: 'delivery.read' },
    },
    {
      path: '/audit',
      name: 'audit',
      component: () => import('@/views/AuditView.vue'),
      meta: { requiresAuth: true, permission: 'audit.read' },
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
