// Lógica pura de las respuestas rápidas. Dos cosas se prueban aquí y las dos son promesas:
// que no se pueda guardar una plantilla que saldría rota, y que insertarla NO pise el borrador.
import { describe, expect, it } from 'vitest'
import {
  MAX_QUICK_REPLIES,
  MAX_QUICK_REPLY_CHARS,
  MAX_QUICK_REPLY_NAME_CHARS,
  insertIntoDraft,
  materializeQuickReplies,
  moveQuickReply,
  quickReplyErrors,
} from '@/lib/quickReplies'
import type { QuickReply } from '@/services/messaging.api'

const entry = (over: Partial<QuickReply> = {}): QuickReply => ({
  id: 'quick-1',
  name: 'Va en camino',
  text: 'Tu pedido ya salió.',
  ...over,
})

describe('materializeQuickReplies', () => {
  it('ofrece las sugeridas cuando el tenant nunca las tocó', () => {
    const suggested = [entry({ id: 'sug-1' })]
    expect(materializeQuickReplies(null, suggested)).toEqual(suggested)
  })

  it('respeta la lista vacía: `[]` es "ninguna", no "sin configurar"', () => {
    // Sin esto, borrarlas todas y guardar las devolvería en la siguiente carga.
    expect(materializeQuickReplies([], [entry()])).toEqual([])
  })

  it('copia las entradas para no compartir referencias con las sugeridas', () => {
    const suggested = [entry()]
    const result = materializeQuickReplies(null, suggested)
    result[0]!.name = 'Otra'
    expect(suggested[0]!.name).toBe('Va en camino')
  })
})

describe('moveQuickReply', () => {
  const list = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })]

  it('sube una plantilla un puesto', () => {
    expect(moveQuickReply(list, 1, -1).map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('la baja un puesto', () => {
    expect(moveQuickReply(list, 1, 1).map((e) => e.id)).toEqual(['a', 'c', 'b'])
  })

  it('en los extremos no hace nada', () => {
    expect(moveQuickReply(list, 0, -1).map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(moveQuickReply(list, 2, 1).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('quickReplyErrors', () => {
  it('una lista vacía no es un problema', () => {
    expect(quickReplyErrors([])).toEqual([])
  })

  it('una plantilla normal no es un problema', () => {
    expect(quickReplyErrors([entry()])).toEqual([])
  })

  it('exige nombre y texto', () => {
    expect(quickReplyErrors([entry({ name: '  ' })])[0]).toContain('nombre')
    expect(quickReplyErrors([entry({ text: '  ' })])[0]).toContain('texto')
  })

  it('nombra a la culpable, que con veinte tarjetas es lo único útil', () => {
    const problems = quickReplyErrors([entry({ name: 'Datos de Nequi', text: '' })])
    expect(problems[0]).toContain('Datos de Nequi')
  })

  it('sitúa por posición la que aún no tiene nombre', () => {
    const problems = quickReplyErrors([entry(), entry({ id: 'quick-2', name: '' })])
    expect(problems[0]).toContain('#2')
  })

  it('corta los textos y los nombres demasiado largos', () => {
    expect(quickReplyErrors([entry({ text: 'x'.repeat(MAX_QUICK_REPLY_CHARS + 1) })])).toHaveLength(
      1,
    )
    expect(
      quickReplyErrors([entry({ name: 'x'.repeat(MAX_QUICK_REPLY_NAME_CHARS + 1) })]),
    ).toHaveLength(1)
  })

  it('corta la lista pasada de larga', () => {
    const many = Array.from({ length: MAX_QUICK_REPLIES + 1 }, (_, i) => entry({ id: `q-${i}` }))
    expect(quickReplyErrors(many)[0]).toContain(String(MAX_QUICK_REPLIES))
  })

  it('rechaza cualquier marcador, exista o no en el backend', () => {
    // El compositor no interpola: `{menu_link}` saldría con las llaves puestas.
    expect(quickReplyErrors([entry({ text: 'Pide aquí {menu_link}' })])[0]).toContain('{menu_link}')
    expect(quickReplyErrors([entry({ text: 'Hola {nombre}' })])[0]).toContain('{nombre}')
  })

  it('explica por qué, no sólo que está mal', () => {
    expect(quickReplyErrors([entry({ text: '{link}' })])[0]).toContain('no rellenan marcadores')
  })
})

describe('insertIntoDraft', () => {
  it('con el borrador vacío deja sólo la plantilla', () => {
    expect(insertIntoDraft('', 'Gracias', 0)).toEqual({ text: 'Gracias', caret: 7 })
  })

  it('NO pisa lo que ya estaba escrito', () => {
    // Es la regla #1 del compositor: no perder trabajo ajeno.
    const { text } = insertIntoDraft('Hola Ana', 'Gracias', 8)
    expect(text).toBe('Hola Ana Gracias')
  })

  it('inserta en el cursor, no al final', () => {
    const { text } = insertIntoDraft('Hola  Ana', 'Gracias', 5)
    expect(text).toBe('Hola Gracias Ana')
  })

  it('deja el cursor al final de lo insertado', () => {
    const { caret } = insertIntoDraft('Hola', 'Gracias', 4)
    expect(caret).toBe('Hola Gracias'.length)
  })

  it('dos plantillas seguidas se concatenan legibles', () => {
    const first = insertIntoDraft('', 'Gracias.', 0)
    const second = insertIntoDraft(first.text, 'Va en camino.', first.caret)
    expect(second.text).toBe('Gracias. Va en camino.')
  })

  it('no duplica el espacio cuando ya hay uno', () => {
    expect(insertIntoDraft('Hola ', 'Gracias', 5).text).toBe('Hola Gracias')
  })

  it('un cursor fuera de rango no rompe nada', () => {
    expect(insertIntoDraft('Hola', 'Gracias', 999).text).toBe('Hola Gracias')
    expect(insertIntoDraft('Hola', 'Gracias', -5).text).toBe('Gracias Hola')
  })
})
