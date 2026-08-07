// La escalera de precios del domicilio, como reglas puras.
//
// Una banda dice "hasta X km cuesta Y". La primera empieza en cero, cada una empieza donde acabó
// la anterior, y la ÚLTIMA define el máximo de cobertura de la sede: más allá no se cotiza, no se
// cobra y el pedido queda para que una persona decida.
//
// Las reglas se comprueban aquí Y en el servidor, a propósito. El servidor es el que manda —un
// plan inválido no entra aunque el cliente lo mande— pero descubrirlo al pulsar guardar, con un
// mensaje genérico, es lo que hace que alguien deje las tarifas a medias.

export interface BandDraft {
  /** Kilómetro hasta donde llega esta banda. Cadena porque viene de un `<input>` a medio escribir. */
  maxKm: string
  fee: string
}

export interface BandRow extends BandDraft {
  /** Desde dónde empieza: cero para la primera, el máximo de la anterior para el resto. */
  fromKm: number
  /** Sólo la última: es la que decide hasta dónde reparte la sede. */
  isEdge: boolean
  error: string | null
}

const num = (raw: string): number => {
  const value = Number(String(raw).replace(',', '.'))
  return Number.isFinite(value) ? value : NaN
}

/** El error de ESTA banda, o null. Mira la anterior porque una escalera se rompe entre peldaños. */
function bandError(band: BandDraft, previousMax: number | null): string | null {
  const max = num(band.maxKm)
  const fee = num(band.fee)
  if (band.maxKm.trim() === '' || Number.isNaN(max)) return 'Falta la distancia.'
  if (max <= 0) return 'La distancia debe ser mayor que cero.'
  if (band.fee.trim() === '' || Number.isNaN(fee)) return 'Falta la tarifa.'
  if (fee < 0) return 'La tarifa no puede ser negativa.'
  if (previousMax !== null && max === previousMax) return 'Esta distancia está repetida.'
  if (previousMax !== null && max < previousMax) {
    return 'Cada banda tiene que llegar más lejos que la anterior.'
  }
  return null
}

/** Las bandas con su tramo, su error y cuál es el borde de cobertura. */
export function describeBands(bands: BandDraft[]): BandRow[] {
  let previousMax: number | null = null
  return bands.map((band, index) => {
    const error = bandError(band, previousMax)
    const fromKm = previousMax ?? 0
    // Sólo avanza el listón si la banda es válida: si no, la siguiente se compararía contra un
    // NaN y heredaría un error que no es suyo.
    if (error === null) previousMax = num(band.maxKm)
    return { ...band, fromKm, isEdge: index === bands.length - 1, error }
  })
}

export function bandsAreValid(bands: BandDraft[]): boolean {
  return bands.length > 0 && describeBands(bands).every((b) => b.error === null)
}

/** El primer motivo por el que el plan no se puede guardar, para decirlo una sola vez. */
export function planError(bands: BandDraft[]): string | null {
  if (bands.length === 0) return 'Configura al menos una tarifa de domicilio.'
  return describeBands(bands).find((b) => b.error !== null)?.error ?? null
}

/** Hasta dónde reparte la sede con este plan, o null si aún no es válido. */
export function coverageKm(bands: BandDraft[]): number | null {
  if (!bandsAreValid(bands)) return null
  return num(bands[bands.length - 1]!.maxKm)
}

/** El payload del servidor. Sólo se llama con un plan ya validado. */
export function toPayload(bands: BandDraft[]): { max_distance_km: number; fee: number }[] {
  return bands.map((b) => ({ max_distance_km: num(b.maxKm), fee: num(b.fee) }))
}

/**
 * Qué banda cobra a esta distancia — la misma selección que hace el servidor.
 *
 * Existe para que la pantalla pueda decir "un pedido a 3 km paga $X" sin adivinar. La regla es
 * la primera banda cuyo máximo cubra la distancia; más allá de la última, nadie.
 */
export function feeAt(distanceKm: number, bands: BandDraft[]): number | null {
  for (const band of bands) {
    const max = num(band.maxKm)
    if (Number.isFinite(max) && distanceKm <= max) return num(band.fee)
  }
  return null
}

/** El colchón comercial que el servidor suma antes de elegir banda. Aquí sólo se explica. */
export const PRICING_BUFFER_KM = 0.7
