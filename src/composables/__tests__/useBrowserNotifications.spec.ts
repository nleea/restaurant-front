// El transporte de avisos fuera de la pestaña.
//
// Lo que más importa aquí no es que la notificación salga: es que **el permiso no se gaste**. Un
// `denied` es permanente desde la página, así que pedirlo fuera del gesto que lo enciende mata la
// feature para ese dispositivo para siempre y no hay arreglo desde la app.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBrowserNotifications } from '../useBrowserNotifications'

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => 'granted')
  static instances: { title: string; options?: NotificationOptions }[] = []
  onclick: (() => void) | null = null

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push({ title, options })
  }

  close = vi.fn<() => void>()
}

function installNotification(permission: NotificationPermission = 'default'): void {
  FakeNotification.permission = permission
  FakeNotification.instances = []
  FakeNotification.requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => 'granted')
  vi.stubGlobal('Notification', FakeNotification)
}

const alert = (id = 'a1') => ({ id, title: 'Stock bajo', body: 'Camarón' })

beforeEach(() => {
  localStorage.clear()
  document.title = 'El Pase'
  vi.unstubAllGlobals()
  installNotification()
})

describe('el permiso', () => {
  it('NO se pide con sólo usar el composable', () => {
    useBrowserNotifications()

    // Éste es el test que protege la feature entera: pedirlo al cargar es la forma conocida de
    // conseguir un `denied` de alguien que ni sabía qué le preguntaban.
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('se pide al encender, y sólo entonces', async () => {
    const notifications = useBrowserNotifications()

    await notifications.enable()

    expect(FakeNotification.requestPermission).toHaveBeenCalledOnce()
    expect(notifications.active.value).toBe(true)
  })

  it('un permiso denegado no se guarda como encendido', async () => {
    installNotification()
    FakeNotification.requestPermission = vi.fn<() => Promise<NotificationPermission>>(async () => 'denied')
    const notifications = useBrowserNotifications()

    const ok = await notifications.enable()

    // Guardar "encendido" con el permiso denegado daría una pantalla que dice avisar sin avisar.
    expect(ok).toBe(false)
    expect(notifications.enabled.value).toBe(false)
    expect(notifications.blocked.value).toBe(true)
  })

  it('con el permiso ya concedido no se vuelve a pedir', async () => {
    installNotification('granted')
    const notifications = useBrowserNotifications()

    await notifications.enable()

    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
    expect(notifications.active.value).toBe(true)
  })
})

describe('avisar', () => {
  async function enabled() {
    installNotification('granted')
    const notifications = useBrowserNotifications()
    await notifications.enable()
    // Decir "no había nada" es lo que le da permiso a avisar. Ver `seed`.
    notifications.seed([])
    return notifications
  }

  it('una alerta nueva sale como notificación del sistema', async () => {
    const notifications = await enabled()

    expect(notifications.notify(alert())).toBe(true)
    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0]!.title).toBe('Stock bajo')
    expect(FakeNotification.instances[0]!.options?.body).toBe('Camarón')
  })

  it('la misma alerta no vuelve a avisar aunque se recuerde', async () => {
    const notifications = await enabled()
    notifications.notify(alert())

    // Los recordatorios cada 5 minutos son del PANEL. Repetirlos en el escritorio consigue que
    // la persona los apague, y los apaga para todo.
    expect(notifications.notify(alert())).toBe(false)
    expect(FakeNotification.instances).toHaveLength(1)
  })

  it('otra alerta distinta sí avisa', async () => {
    const notifications = await enabled()
    notifications.notify(alert('a1'))

    expect(notifications.notify(alert('a2'))).toBe(true)
    expect(FakeNotification.instances).toHaveLength(2)
  })

  it('lleva `tag` por alerta para que el sistema colapse las repetidas', async () => {
    const notifications = await enabled()
    notifications.notify(alert('a9'))

    expect(FakeNotification.instances[0]!.options?.tag).toBe('alert:a9')
  })

  it('lo sembrado al cargar no se anuncia: recargar no reproduce lo de ayer', async () => {
    const notifications = await enabled()

    notifications.seed(['vieja-1', 'vieja-2'])

    expect(notifications.notify(alert('vieja-1'))).toBe(false)
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('apagadas no avisan', async () => {
    const notifications = await enabled()
    notifications.disable()

    expect(notifications.notify(alert())).toBe(false)
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('sin permiso no avisa aunque esté encendido', () => {
    installNotification('denied')
    const notifications = useBrowserNotifications()

    expect(notifications.notify(alert())).toBe(false)
  })
})

describe('antes de sembrar', () => {
  it('no avisa de nada, pase lo que pase', async () => {
    installNotification('granted')
    const notifications = useBrowserNotifications()
    await notifications.enable()

    // Sin saber qué había ya, cualquier aviso podría ser una alerta de anoche.
    expect(notifications.notify(alert())).toBe(false)
    expect(FakeNotification.instances).toHaveLength(0)

    notifications.seed([])
    expect(notifications.notify(alert())).toBe(true)
  })
})

describe('el contador del título', () => {
  it('lleva la cuenta y devuelve el título limpio al llegar a cero', () => {
    const notifications = useBrowserNotifications()

    notifications.setBadge(3)
    expect(document.title).toBe('(3) El Pase')

    notifications.setBadge(0)
    expect(document.title).toBe('El Pase')
  })

  it('no acumula paréntesis al actualizarse', () => {
    const notifications = useBrowserNotifications()

    notifications.setBadge(1)
    notifications.setBadge(2)

    expect(document.title).toBe('(2) El Pase')
  })

  it('funciona con el permiso DENEGADO, que es su razón de existir', () => {
    installNotification('denied')
    const notifications = useBrowserNotifications()

    notifications.setBadge(2)

    // Es la única señal que no pide permiso a nadie, así que es la que nunca puede faltar.
    expect(document.title).toBe('(2) El Pase')
  })
})

describe('el sonido', () => {
  it('está apagado por defecto', () => {
    // Un sonido inesperado en un local es peor que ningún sonido.
    expect(useBrowserNotifications().soundOn.value).toBe(false)
  })

  it('es una preferencia del dispositivo, no de la cuenta', () => {
    useBrowserNotifications().setSound(true)

    // Otra "sesión" en el mismo aparato la recuerda…
    expect(useBrowserNotifications().soundOn.value).toBe(true)
    // …y vive en `localStorage`, que es de ese navegador y de ningún otro.
    expect(localStorage.getItem('alerts.notifications.sound')).toBe('1')
  })
})

describe('un navegador sin soporte', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    // @ts-expect-error — se elimina a propósito para simular el navegador que no lo trae.
    delete window.Notification
  })

  it('no rompe nada y lo dice', async () => {
    const notifications = useBrowserNotifications()

    expect(notifications.supported).toBe(false)
    expect(notifications.permission.value).toBe('unsupported')
    expect(await notifications.enable()).toBe(false)
    expect(notifications.notify(alert())).toBe(false)
  })

  it('el contador del título sigue funcionando', () => {
    useBrowserNotifications().setBadge(4)

    expect(document.title).toBe('(4) El Pase')
  })
})
