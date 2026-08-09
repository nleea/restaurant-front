// The routes carry the gate; the sidebar only reflects it. This asserts the gate itself,
// because a hidden nav entry is not access control — a user can type the URL.
import { describe, expect, it } from 'vitest'

import router from '@/router/index'

describe('WhatsApp routes', () => {
  it('gates the inbox on messaging.read', () => {
    const route = router.resolve('/whatsapp')
    expect(route.name).toBe('whatsapp-inbox')
    expect(route.meta.requiresAuth).toBe(true)
    expect(route.meta.permission).toBe('messaging.read')
  })

  it('gates the sessions screen on messaging.manage', () => {
    const route = router.resolve('/whatsapp/sessions')
    expect(route.name).toBe('whatsapp-sessions')
    expect(route.meta.requiresAuth).toBe(true)
    // Reading the inbox must not let anyone re-pair a branch's number.
    expect(route.meta.permission).toBe('messaging.manage')
  })

  it('keeps the two screens on separate permissions', () => {
    expect(router.resolve('/whatsapp').meta.permission).not.toBe(
      router.resolve('/whatsapp/sessions').meta.permission,
    )
  })

  it('gates the autoreply settings on messaging.manage', () => {
    // Editing the greeting changes what every customer of every branch is told. Attending a
    // conversation must not carry that: `messaging.attend` is answering, not rewriting.
    const route = router.resolve('/whatsapp/autoreply')
    expect(route.name).toBe('whatsapp-autoreply')
    expect(route.meta.requiresAuth).toBe(true)
    expect(route.meta.permission).toBe('messaging.manage')
  })

  it('gates the statuses screen on messaging.manage', () => {
    // Programar un estado decide qué se le enseña a TODOS los contactos de la sede, y eso es una
    // decisión del negocio: atender un chat no puede darla.
    const route = router.resolve('/whatsapp/statuses')
    expect(route.name).toBe('whatsapp-statuses')
    expect(route.meta.requiresAuth).toBe(true)
    expect(route.meta.permission).toBe('messaging.manage')
  })

  it('does not let the inbox permission reach the statuses screen', () => {
    expect(router.resolve('/whatsapp/statuses').meta.permission).not.toBe('messaging.read')
    expect(router.resolve('/whatsapp/statuses').meta.permission).not.toBe('messaging.attend')
  })

  it('does not let the inbox permission reach the autoreply settings', () => {
    expect(router.resolve('/whatsapp/autoreply').meta.permission).not.toBe(
      router.resolve('/whatsapp').meta.permission,
    )
  })
})
