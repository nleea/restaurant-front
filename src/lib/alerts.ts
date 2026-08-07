// Cómo se le habla al dueño de las alertas: nombres, explicaciones y unidades.
//
// Vive fuera de los componentes porque el mismo vocabulario lo usan el panel, la pantalla de
// configuración y el indicador del riel. Que "colchón de recuperación" signifique lo mismo en
// los tres sitios no es cosmética: es la diferencia entre entender el ajuste y apagarlo.
import type { RuleKey } from '@/services/alerts.api'

export const RULE_KEYS: RuleKey[] = [
  'low_stock',
  'whatsapp_session_down',
  'cash_session_left_open',
  'assistant_quota',
]

/** El nombre corto. El dueño no piensa en "reglas", piensa en cosas que le pasan. */
export const RULE_LABEL: Record<RuleKey, string> = {
  low_stock: 'Se está acabando un insumo',
  whatsapp_session_down: 'El WhatsApp dejó de recibir',
  cash_session_left_open: 'La caja quedó abierta',
  assistant_quota: 'Se está acabando el saldo del asistente',
}

/** Qué vigila, en una frase, y por qué importa. */
export const RULE_HINT: Record<RuleKey, string> = {
  low_stock:
    'Usa el mínimo que ya tiene cada insumo en Inventario. Un insumo sin mínimo no avisa nunca.',
  whatsapp_session_down:
    'Una sesión caída deja la sucursal muda: los clientes escriben y no llega nada.',
  cash_session_left_open:
    'Una caja que nadie cerró es un arqueo que mañana no cuadra y nadie sabe por qué.',
  assistant_quota:
    'Avisa antes de que se agote, no cuando ya pasó: agotado, el asistente contesta un mensaje fijo.',
}

/** En qué se mide el colchón de cada regla, para no pedir "2" a secas. */
/**
 * Cada cuánto barre el vigilante (`SWEEP_MINUTE_STEP` en el worker).
 *
 * Es el SUELO real de los recordatorios: por debajo de esto, llegan a este ritmo igualmente.
 * Se dice en la pantalla en vez de rechazarlo al guardar — rechazarlo acoplaría el formulario a
 * una constante del worker, y el día que el barrido baje, las validaciones guardadas mentirían.
 */
export const SWEEP_MINUTES = 5

/**
 * Cada cuánto vuelve a salir un WhatsApp de una alerta que sigue sin tomar.
 *
 * **No es configurable, y el espejo aquí es sólo para poder explicarlo.** Acota cuántos mensajes
 * puede mandar el número del negocio en un día (24/4 = 6): quien paga un mensaje de más no es el
 * dueño, es el número, y bloquearlo deja mudo todo el WhatsApp del restaurante.
 */
export const WHATSAPP_REESCALATION_HOURS = 4

export const BUFFER_UNIT: Record<RuleKey, string> = {
  // Porcentaje y no cantidad: los sujetos de esta regla son insumos con unidades de medida
  // distintas entre sí, así que un número absoluto significaría algo distinto para cada uno
  // (1 kg sobre un mínimo de 2 kg de camarón es un 50%; 1 g sobre 500 g de sal, un 0,2%).
  low_stock: '% por encima del mínimo del insumo',
  whatsapp_session_down: 'no aplica — reconectar re-arma',
  cash_session_left_open: 'minutos abierta',
  assistant_quota: 'puntos porcentuales por debajo del umbral',
}

/** Qué significa el umbral, cuando la regla lo usa. `null` = esta regla no lo usa. */
export const THRESHOLD_LABEL: Record<RuleKey, string | null> = {
  low_stock: null,
  whatsapp_session_down: null,
  cash_session_left_open: 'Hora a partir de la cual avisa (0–23)',
  assistant_quota: 'Porcentaje gastado a partir del cual avisa (por defecto, el del plan)',
}

/** Icono por regla. Mono, como el resto de El Pase: el color se reserva para el estado. */
export const RULE_ICON: Record<RuleKey, string> = {
  low_stock: 'pi-box',
  whatsapp_session_down: 'pi-comments',
  cash_session_left_open: 'pi-wallet',
  assistant_quota: 'pi-sparkles',
}

/**
 * "hace 5 min", "hace 2 h". Para una alerta, CUÁNTO lleva encendida es el dato.
 *
 * Una hora exacta obliga a restar mentalmente; lo que se quiere saber de un tomate que falta
 * es si lleva cinco minutos o desde ayer.
 */
export function elapsedLabel(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '—'
  const started = new Date(iso).getTime()
  if (Number.isNaN(started)) return '—'
  const minutes = Math.max(0, Math.floor((now - started) / 60_000))
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}

/**
 * Cuánto "quema" una alerta, para el degradado de la lámpara de calor.
 *
 * Es el mismo lenguaje que el resto del producto (comandas, despacho): lo que lleva mucho
 * tiempo sin atender se calienta. Una alerta tomada no quema — ya hay alguien encima.
 */
export function heatOf(
  status: string,
  firedAt: string | null,
  now: number = Date.now(),
): 'none' | 'warm' | 'hot' {
  if (status !== 'fired') return 'none'
  if (!firedAt) return 'warm'
  const minutes = (now - new Date(firedAt).getTime()) / 60_000
  if (Number.isNaN(minutes)) return 'warm'
  return minutes >= 30 ? 'hot' : 'warm'
}
