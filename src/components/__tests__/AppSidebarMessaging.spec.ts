// Una entrada de menú oculta no es control de acceso —la ruta es la que manda, y eso lo
// prueba `router/__tests__/messagingRoutes.spec.ts`—, pero enseñar un enlace que sólo lleva
// a un 403 es una promesa rota. Aquí se comprueba la otra mitad: no se ofrece lo que no se
// puede abrir.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/whatsapp' }),
  useRouter: () => ({ replace: vi.fn<(...a: unknown[]) => unknown>() }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}))

vi.mock('@/components/BranchSelector.vue', () => ({
  default: { name: 'BranchSelector', template: '<div />' },
}))

import AppSidebar from '../AppSidebar.vue'
import { useAuthStore } from '@/stores/auth'

function mountWith(permissions: string[]) {
  useAuthStore().permissions = permissions
  return mount(AppSidebar, {
    props: { open: true },
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('la navegación de WhatsApp', () => {
  it('esconde las respuestas automáticas sin messaging.manage', () => {
    const wrapper = mountWith(['messaging.read', 'messaging.attend'])
    expect(wrapper.html()).not.toContain('/whatsapp/autoreply')
    // Y quien atiende el inbox sí lo ve, para no confundir "oculto" con "vacío".
    expect(wrapper.html()).toContain('/whatsapp"')
  })

  it('la ofrece con messaging.manage', () => {
    const wrapper = mountWith(['messaging.read', 'messaging.manage'])
    expect(wrapper.html()).toContain('/whatsapp/autoreply')
    expect(wrapper.text()).toContain('Respuestas automáticas')
  })

  it('sin ningún permiso de mensajería no queda rastro del módulo', () => {
    const wrapper = mountWith([])
    expect(wrapper.html()).not.toContain('/whatsapp')
  })
})
