// La ruta es la puerta; la entrada del riel sólo la refleja. Un enlace oculto no es control
// de acceso — cualquiera puede escribir la URL.
import { describe, expect, it } from 'vitest'

import router from '@/router/index'

describe('rutas de alertas', () => {
  it('el panel pide alerts.read', () => {
    const route = router.resolve('/alerts')
    expect(route.name).toBe('alerts')
    expect(route.meta.requiresAuth).toBe(true)
    // Ver y TOMAR es el turno: quien está trabajando tiene que poder hacerse cargo.
    expect(route.meta.permission).toBe('alerts.read')
  })

  it('la configuración pide alerts.manage', () => {
    const route = router.resolve('/alerts/rules')
    expect(route.name).toBe('alerts-rules')
    expect(route.meta.requiresAuth).toBe(true)
    // Decidir umbrales y a quién se le escribe a las once es del dueño.
    expect(route.meta.permission).toBe('alerts.manage')
  })

  it('ver alertas no deja configurarlas', () => {
    expect(router.resolve('/alerts').meta.permission).not.toBe(
      router.resolve('/alerts/rules').meta.permission,
    )
  })

  it('ninguna de las dos es pública', () => {
    expect(router.resolve('/alerts').meta.public).toBeUndefined()
    expect(router.resolve('/alerts/rules').meta.public).toBeUndefined()
  })
})
