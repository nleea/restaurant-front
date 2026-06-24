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
