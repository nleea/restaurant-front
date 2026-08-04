// Sacar un aviso FUERA de la pestaña: notificación del sistema, sonido y contador en el título.
//
// Existe porque una alerta que sólo se ve entrando a la pantalla de alertas no es un aviso, es un
// informe. Durante un servicio nadie tiene esa pantalla abierta: están en Caja, en Comandas o en
// el KDS. Con los recordatorios cada cinco minutos el problema empeora — el sistema insistiría en
// un sitio donde no hay nadie mirando.
//
// **Lo más fácil de romper aquí no es el código: es gastar el permiso.** Un `denied` es permanente
// desde la página; para revertirlo hay que entrar a los ajustes del navegador y nadie lo hace. Por
// eso `requestPermission()` se llama SÓLO desde el gesto que enciende las notificaciones, nunca al
// cargar. Si algo lo llama en un `onMounted`, la feature queda muerta para ese dispositivo.
//
// Transporte, no pantalla: el día que las comandas quieran avisar así, reusan esto.

import { computed, ref } from 'vue'

/** Preferencias de DISPOSITIVO, no de cuenta: el permiso del navegador ya lo es. */
const ENABLED_KEY = 'alerts.notifications.enabled'
const SOUND_KEY = 'alerts.notifications.sound'

/**
 * Un tono corto en data-URI, no un fichero.
 *
 * Un `.mp3` por red es una petición que puede fallar justo cuando hace falta, y el aviso se
 * perdería en silencio. Esto son ~0.15 s de onda generada: fea, corta y siempre disponible.
 */
const CHIME =
  'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied'

/** Lo mínimo que hace falta para pintar un aviso: quién es y de qué va. */
export interface NotifiableAlert {
  id: string
  title: string
  body: string
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    // Safari en privado tira al leer `localStorage`. Sin preferencia guardada, apagado.
    return false
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Que no se pueda recordar la preferencia no puede impedir usarla en esta sesión.
  }
}

export function useBrowserNotifications() {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const permission = ref<NotificationPermissionState>(
    supported ? (window.Notification.permission as NotificationPermissionState) : 'unsupported',
  )
  const enabled = ref(readFlag(ENABLED_KEY))
  const soundOn = ref(readFlag(SOUND_KEY))

  /**
   * Ids ya avisados en esta sesión. **Se siembra al cargar** con lo que ya había: recargar la
   * página no puede reproducir las alertas de ayer como si acabaran de pasar.
   */
  const notified = new Set<string>()
  /**
   * Hasta que no se diga qué había YA, no se anuncia nada.
   *
   * No es una optimización: es el invariante. Sin él, quien avisa depende del orden en que se
   * resuelvan las microtareas entre cargar la lista y sembrarla — y ese orden puso tres
   * notificaciones de escritorio de alertas de anoche en la primera prueba que lo miró.
   */
  let primed = false
  /** El título limpio, para poder devolverlo cuando el contador llega a cero. */
  let baseTitle = typeof document !== 'undefined' ? document.title : ''

  /** Puede avisar de verdad: encendido, soportado y con permiso. */
  const active = computed(() => enabled.value && supported && permission.value === 'granted')

  /** Lo bloqueó el navegador: se arregla ahí, no en la app, y hay que decirlo así. */
  const blocked = computed(() => permission.value === 'denied')

  /**
   * Enciende las notificaciones pidiendo permiso. **Sólo desde un gesto del usuario.**
   *
   * Devuelve si quedaron activas. Un `denied` deja `enabled` en falso: guardar "encendido" con el
   * permiso denegado produciría una pantalla que dice que avisa cuando no avisa.
   */
  async function enable(): Promise<boolean> {
    if (!supported) return false
    if (permission.value !== 'granted') {
      permission.value = (await window.Notification.requestPermission()) as NotificationPermissionState
    }
    const granted = permission.value === 'granted'
    enabled.value = granted
    writeFlag(ENABLED_KEY, granted)
    return granted
  }

  function disable(): void {
    enabled.value = false
    writeFlag(ENABLED_KEY, false)
  }

  function setSound(on: boolean): void {
    soundOn.value = on
    writeFlag(SOUND_KEY, on)
  }

  /**
   * Marca como ya avisadas las alertas que existían al abrir la pantalla.
   *
   * Sin esto, entrar al panel con tres alertas abiertas de anoche dispararía tres notificaciones
   * de escritorio, y quien las reciba las apagará para siempre.
   */
  function seed(ids: string[]): void {
    ids.forEach((id) => notified.add(id))
    primed = true
  }

  /**
   * Avisa de una alerta si es la primera vez que se ve.
   *
   * **Una por alerta, no por recordatorio.** El panel insiste cada cinco minutos porque es barato;
   * una notificación del sistema es intrusiva por diseño, y repetirla consigue que la persona la
   * apague — y cuando la apaga, la apaga para todo, incluida la alerta de mañana que sí importaba.
   */
  function notify(alert: NotifiableAlert): boolean {
    if (!primed || !active.value || notified.has(alert.id)) return false
    notified.add(alert.id)
    try {
      // `tag` por alerta: si dos pestañas avisan de lo mismo, el sistema las colapsa en una.
      const notification = new window.Notification(alert.title, {
        body: alert.body,
        tag: `alert:${alert.id}`,
      })
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    } catch {
      // Un navegador que dice soportarlo y falla al construirla no puede tumbar el panel.
      return false
    }
    if (soundOn.value) play()
    return true
  }

  function play(): void {
    try {
      void new Audio(CHIME).play()
    } catch {
      // Sin gesto previo el navegador bloquea el audio. Es una molestia, no un fallo.
    }
  }

  /**
   * El contador en el título de la pestaña.
   *
   * **No pide permiso a nadie y no es opcional**: es la única señal que sobrevive a un permiso
   * denegado y a un navegador sin soporte, así que se pinta siempre.
   */
  function setBadge(count: number): void {
    if (typeof document === 'undefined') return
    const clean = document.title.replace(/^\(\d+\)\s*/, '')
    if (clean) baseTitle = clean
    document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle
  }

  return {
    supported,
    permission,
    enabled,
    soundOn,
    active,
    blocked,
    enable,
    disable,
    setSound,
    seed,
    notify,
    setBadge,
  }
}
