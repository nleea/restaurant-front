// Las reglas de la escalera de precios. Se prueban aquí, puras, porque el fallo que importa no
// es visual: es guardar un plan con un hueco y descubrir semanas después que los pedidos de ese
// tramo salían sin cobrar el domicilio.
import { describe, expect, it } from 'vitest'
import {
  bandsAreValid,
  coverageKm,
  describeBands,
  feeAt,
  planError,
  toPayload,
} from '@/lib/tariffBands'

const band = (maxKm: string, fee: string) => ({ maxKm, fee })

describe('describeBands', () => {
  it('encadena los tramos: cada banda empieza donde acabó la anterior', () => {
    const rows = describeBands([band('2', '3000'), band('4', '5000'), band('6', '7000')])

    expect(rows.map((r) => [r.fromKm, Number(r.maxKm)])).toEqual([
      [0, 2],
      [2, 4],
      [4, 6],
    ])
  })

  it('marca la última como el borde de cobertura', () => {
    const rows = describeBands([band('2', '3000'), band('4', '5000')])

    expect(rows.map((r) => r.isEdge)).toEqual([false, true])
  })

  it('una banda inválida no contamina el tramo de la siguiente', () => {
    // Sin esto, la banda siguiente se compararía contra un NaN y heredaría un error ajeno.
    const rows = describeBands([band('', '3000'), band('4', '5000')])

    expect(rows[0]?.error).toBe('Falta la distancia.')
    expect(rows[1]?.error).toBeNull()
  })
})

describe('lo que el plan rechaza', () => {
  it('una distancia que no crece', () => {
    expect(planError([band('4', '3000'), band('2', '5000')])).toBe(
      'Cada banda tiene que llegar más lejos que la anterior.',
    )
  })

  it('una distancia repetida', () => {
    expect(planError([band('2', '3000'), band('2', '5000')])).toBe(
      'Esta distancia está repetida.',
    )
  })

  it('una distancia de cero o negativa', () => {
    expect(planError([band('0', '3000')])).toBe('La distancia debe ser mayor que cero.')
    expect(planError([band('-1', '3000')])).toBe('La distancia debe ser mayor que cero.')
  })

  it('una tarifa negativa', () => {
    expect(planError([band('2', '-1')])).toBe('La tarifa no puede ser negativa.')
  })

  it('un plan vacío', () => {
    expect(planError([])).toBe('Configura al menos una tarifa de domicilio.')
    expect(bandsAreValid([])).toBe(false)
  })

  it('pero una tarifa de CERO sí vale: un domicilio gratis es una decisión comercial', () => {
    expect(planError([band('2', '0')])).toBeNull()
  })

  it('acepta la coma decimal, que es como se escribe aquí', () => {
    expect(planError([band('2,5', '3000')])).toBeNull()
    expect(coverageKm([band('2,5', '3000')])).toBe(2.5)
  })
})

describe('coverageKm', () => {
  it('es el máximo de la última banda', () => {
    expect(coverageKm([band('2', '3000'), band('6', '7000')])).toBe(6)
  })

  it('es null mientras el plan no sea válido, para no prometer una cobertura falsa', () => {
    expect(coverageKm([band('4', '3000'), band('2', '5000')])).toBeNull()
  })
})

describe('feeAt — la misma selección que hace el servidor', () => {
  const plan = [band('2', '3000'), band('4', '5000'), band('6', '7000')]

  it('cobra la primera banda que cubre la distancia', () => {
    expect(feeAt(1.5, plan)).toBe(3000)
    expect(feeAt(3.2, plan)).toBe(5000)
  })

  it('el límite de una banda pertenece a esa banda, no a la siguiente', () => {
    expect(feeAt(2, plan)).toBe(3000)
    expect(feeAt(4, plan)).toBe(5000)
  })

  it('más allá de la última no cobra nadie: eso es fuera de cobertura', () => {
    expect(feeAt(6.1, plan)).toBeNull()
  })
})

describe('toPayload', () => {
  it('manda números, no las cadenas del formulario', () => {
    expect(toPayload([band('2,5', '3000')])).toEqual([{ max_distance_km: 2.5, fee: 3000 }])
  })
})
