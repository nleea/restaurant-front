// La lógica del editor de respuestas automáticas: sustituir marcadores, redactar la próxima
// apertura, contar mensajes y bloquear un marcador inventado. Es un espejo del backend, así
// que estos casos son los mismos que allá defienden el envío — aquí defienden la vista previa.
import { describe, expect, it } from 'vitest'

import {
  bracedList,
  DEFAULT_GREETING_OPEN,
  firstMatchingFaq,
  formatNextOpening,
  materializeFaqs,
  moveFaq,
  nextOpening,
  normalizeText,
  placeholderErrors,
  pluralVariants,
  previewGreeting,
  renderTemplate,
  triggerMatches,
  typicalMessageCount,
  unknownPlaceholders,
  RECOMMENDED_MAX_MESSAGES,
  type FaqEntry,
} from '../whatsappAutoreply'

/** Una FAQ encendida, con lo mínimo. */
const faq = (id: string, triggers: string[]): FaqEntry => ({
  id,
  name: id,
  triggers,
  text: 'ok',
  enabled: true,
})

const GREETING = ['branch_name', 'menu_link', 'next_opening']
const ORDER = ['branch_name', 'order_number', 'order_total']

describe('marcadores', () => {
  it('sustituye los que tienen valor', () => {
    expect(renderTemplate('Hola desde {branch_name}', { branch_name: 'Sede Centro' })).toBe(
      'Hola desde Sede Centro',
    )
  })

  it('deja intacto el que no tiene valor, en vez de dejar un hueco mudo', () => {
    // "abrimos  " sería una frase que nadie sabe de dónde salió; el marcador a la vista es
    // feo pero depurable, y es lo que hace el backend.
    expect(renderTemplate('Abrimos {next_opening}', {})).toBe('Abrimos {next_opening}')
  })

  it('señala los que no existen, sin repetirlos', () => {
    expect(unknownPlaceholders('Hola {cliente}, {cliente} de {branch_name}', GREETING)).toEqual([
      'cliente',
    ])
  })

  it('acepta un texto sin marcadores', () => {
    expect(unknownPlaceholders('Ya te contactamos.', GREETING)).toEqual([])
  })
})

describe('vista previa del saludo', () => {
  const base = {
    businessName: 'Sabor Costeño',
    branchName: 'Sede Centro',
    branchAddress: 'Cra 5 #12-30',
    branchPhone: '3001112233',
    menuLink: 'https://demo.wsquote.uk/store/CENTRO?t=…',
    assistantOffer: false,
  }

  it('saluda con el nombre del NEGOCIO, no con el de la sucursal', () => {
    // El fallo original: la sucursal se llama "Main Branch" hasta que alguien la renombra,
    // y el saludo lo estaba enseñando en vez del nombre del restaurante.
    const text = previewGreeting({
      ...base,
      branchName: 'Main Branch',
      template: DEFAULT_GREETING_OPEN,
    })
    expect(text).toContain('Sabor Costeño')
    expect(text).not.toContain('Main Branch')
  })

  it('resuelve nombre de sede y enlace cuando el texto los pide', () => {
    const text = previewGreeting({
      ...base,
      template: 'Bienvenido a {branch_name}. Carta: {menu_link}',
    })
    expect(text).toBe('Bienvenido a Sede Centro. Carta: https://demo.wsquote.uk/store/CENTRO?t=…')
  })

  it('resuelve la dirección y el teléfono de la sede', () => {
    const text = previewGreeting({
      ...base,
      template: 'Estamos en {branch_address}. Tel: {branch_phone}',
    })
    expect(text).toBe('Estamos en Cra 5 #12-30. Tel: 3001112233')
  })

  it('un dato que falta deja el marcador a la vista, no un hueco mudo', () => {
    // "Estamos en " sería una frase que nadie sabe de dónde salió.
    const text = previewGreeting({
      ...base,
      branchAddress: undefined,
      template: 'Estamos en {branch_address}',
    })
    expect(text).toBe('Estamos en {branch_address}')
  })

  it('el mismo texto da un enlace distinto por sucursal', () => {
    const template = 'Pide en {branch_name}: {menu_link}'
    const centro = previewGreeting({ ...base, template })
    const norte = previewGreeting({
      ...base,
      template,
      branchName: 'Sede Norte',
      menuLink: 'https://demo.wsquote.uk/store/NORTE?t=…',
    })
    expect(centro).toContain('CENTRO')
    expect(norte).toContain('NORTE')
    expect(centro).not.toBe(norte)
  })

  it('la variante de cerrado dice cuándo se abre', () => {
    const text = previewGreeting({
      ...base,
      template: 'Cerrados; abrimos {next_opening}.',
      nextOpeningLabel: 'mañana a las 8:00',
    })
    expect(text).toBe('Cerrados; abrimos mañana a las 8:00.')
  })

  it('añade la oferta del asistente sólo cuando está encendida', () => {
    const template = 'Hola.'
    expect(previewGreeting({ ...base, template })).toBe('Hola.')
    expect(previewGreeting({ ...base, template, assistantOffer: true })).toContain('Escribe *1*')
  })
})

describe('próxima apertura', () => {
  const windows = [
    { weekday: 0, openMinute: 480, closeMinute: 1200 }, // lunes 8:00–20:00
    { weekday: 3, openMinute: 630, closeMinute: 1200 }, // jueves 10:30–20:00
  ]

  it('salta las aperturas de hoy que ya pasaron', () => {
    // Lunes a las 9:00: la de hoy ya abrió, así que la próxima es el jueves.
    expect(nextOpening(windows, 0, 540)).toEqual({ weekday: 3, minute: 630 })
  })

  it('da la de hoy cuando todavía no ha llegado', () => {
    expect(nextOpening(windows, 0, 400)).toEqual({ weekday: 0, minute: 480 })
  })

  it('da la vuelta a la semana', () => {
    // Viernes: no hay nada más esta semana, así que vuelve al lunes.
    expect(nextOpening(windows, 4, 600)).toEqual({ weekday: 0, minute: 480 })
  })

  it('es null sin horarios cargados — y eso deja el marcador a la vista', () => {
    expect(nextOpening([], 0, 540)).toBeNull()
    expect(formatNextOpening(null, 0)).toBeNull()
  })

  it('habla como habla la gente: hoy, mañana, o el nombre del día', () => {
    expect(formatNextOpening({ weekday: 0, minute: 480 }, 0)).toBe('hoy a las 8:00')
    expect(formatNextOpening({ weekday: 1, minute: 480 }, 0)).toBe('mañana a las 8:00')
    expect(formatNextOpening({ weekday: 3, minute: 630 }, 0)).toBe('el jueves a las 10:30')
    // Y cruzando el domingo, no "en -4 días".
    expect(formatNextOpening({ weekday: 1, minute: 600 }, 5)).toBe('el martes a las 10:00')
  })
})

describe('cuántos mensajes gasta un pedido', () => {
  const on = (text = 'Aviso') => ({ enabled: true, text })
  const off = { enabled: false, text: 'Aviso' }

  it('cuenta el recorrido normal de un pedido', () => {
    expect(
      typicalMessageCount({
        order_received: on(),
        assigned: on(),
        on_the_way: on(),
        delivered: on(),
      }),
    ).toBe(4)
  })

  it('encender los cinco del recorrido pasa el techo — que es de lo que avisa la pantalla', () => {
    const all = {
      order_received: on(),
      ready: on(),
      assigned: on(),
      on_the_way: on(),
      delivered: on(),
    }
    expect(typicalMessageCount(all)).toBe(5)
    expect(typicalMessageCount(all)).toBeGreaterThan(RECOMMENDED_MAX_MESSAGES)
  })

  it('no cuenta lo apagado', () => {
    expect(typicalMessageCount({ order_received: on(), on_the_way: off })).toBe(1)
  })

  it('no cuenta un aviso encendido pero vacío: no habría nada que mandar', () => {
    expect(typicalMessageCount({ order_received: { enabled: true, text: '   ' } })).toBe(0)
  })

  it('deja fuera cancelado: es el otro final, no un mensaje más', () => {
    // Un pedido cancelado no se entrega, así que sumarlo daría un recorrido que nadie vive.
    expect(typicalMessageCount({ cancelled: on() })).toBe(0)
  })

  it('el techo recomendado es el recorrido completo', () => {
    expect(RECOMMENDED_MAX_MESSAGES).toBe(4)
  })
})

describe('marcadores inválidos antes de guardar', () => {
  const base = {
    greetingOpenText: 'Hola {branch_name}',
    greetingClosedText: 'Abrimos {next_opening}',
    statusMapping: {},
    greetingPlaceholders: GREETING,
    orderPlaceholders: ORDER,
  }

  it('no encuentra nada en un formulario correcto', () => {
    expect(placeholderErrors(base)).toEqual([])
  })

  it('nombra al culpable del saludo, con llaves', () => {
    expect(placeholderErrors({ ...base, greetingOpenText: 'Hola {cliente}' })).toEqual(['{cliente}'])
  })

  it('rechaza un marcador de pedido dentro del saludo', () => {
    // No es un error de sintaxis: es un texto que saldría con un hueco.
    expect(placeholderErrors({ ...base, greetingOpenText: 'Total {order_total}' })).toEqual([
      '{order_total}',
    ])
  })

  it('rechaza {menu_link} dentro de un aviso de pedido encendido', () => {
    expect(
      placeholderErrors({
        ...base,
        statusMapping: { order_received: { enabled: true, text: 'Mira {menu_link}' } },
      }),
    ).toEqual(['{menu_link}'])
  })

  it('ignora un aviso apagado: no se manda, así que no puede romper nada', () => {
    expect(
      placeholderErrors({
        ...base,
        statusMapping: { ready: { enabled: false, text: 'Hola {cualquiera}' } },
      }),
    ).toEqual([])
  })

  it('no repite un mismo culpable que aparece en dos sitios', () => {
    expect(
      placeholderErrors({
        ...base,
        greetingOpenText: 'Hola {cliente}',
        greetingClosedText: 'Adiós {cliente}',
      }),
    ).toEqual(['{cliente}'])
  })
})

describe('bracedList', () => {
  it('los enseña como se escriben', () => {
    expect(bracedList(['menu_link', 'branch_name'])).toBe('{menu_link}, {branch_name}')
  })
})

describe('FAQs por palabra clave', () => {
  // La MISMA tabla de falsos positivos que el backend (`test_faq_matching.py`). Vive duplicada a
  // propósito y por eso se prueba dos veces: si el espejo se desvía, la pantalla miente sobre lo
  // que va a pasar de verdad.
  it('no confunde un reclamo de pago con la pregunta de los métodos de pago', () => {
    expect(triggerMatches('pago', 'ya pagué y no me llegó')).toBe(false)
  })

  it('no confunde "¿ya me lo enviaron?" con la pregunta de cobertura', () => {
    expect(triggerMatches('envian', '¿ya me lo enviaron?')).toBe(false)
    expect(triggerMatches('envios', '¿ya me lo enviaron?')).toBe(false)
  })

  it('encuentra un gatillo en singular cuando el cliente escribe el plural', () => {
    expect(triggerMatches('domicilio', '¿hacen domicilios?')).toBe(true)
  })

  it('documenta el residuo: la dirección del cliente SÍ coincide', () => {
    // Palabra completa no salva este caso; lo salva el gate de pedido vivo, que es del backend.
    expect(triggerMatches('direccion', 'mi dirección es la calle 5 #3-20')).toBe(true)
  })

  it('no coincide con un gatillo metido dentro de otra palabra', () => {
    expect(triggerMatches('hora', 'ahora mismo')).toBe(false)
    expect(triggerMatches('pago', 'pagoteca')).toBe(false)
  })

  it('coincide una frase completa, y no sus palabras en otro orden', () => {
    expect(triggerMatches('a que hora abren', 'buenas, ¿a qué hora abren hoy?')).toBe(true)
    expect(triggerMatches('a que hora abren', 'abren a que hora dijiste')).toBe(false)
  })

  it('no hace stemming más allá del plural', () => {
    expect(pluralVariants('pago')).not.toContain('pagu')
    expect(triggerMatches('cerrar', 'cerrado')).toBe(false)
  })

  it('normaliza tildes y mayúsculas por los dos lados', () => {
    expect(normalizeText('¿A QUÉ HORA ABREN?')).toBe('a que hora abren')
    expect(triggerMatches('mañana', '¿abren mañana?')).toBe(true)
  })

  it('gana la primera de la lista, y reordenar cambia el ganador', () => {
    const a = faq('a', ['horario'])
    const b = faq('b', ['horario'])
    expect(firstMatchingFaq([a, b], '¿el horario?')?.id).toBe('a')
    expect(firstMatchingFaq([b, a], '¿el horario?')?.id).toBe('b')
  })

  it('una FAQ apagada o sin texto nunca gana', () => {
    const off = { ...faq('off', ['horario']), enabled: false }
    const empty = { ...faq('empty', ['horario']), text: '  ' }
    const good = faq('good', ['horario'])
    expect(firstMatchingFaq([off, empty, good], 'horario')?.id).toBe('good')
  })

  it('sin coincidencia devuelve null', () => {
    expect(firstMatchingFaq([faq('a', ['horario'])], 'quiero una hamburguesa')).toBeNull()
  })
})

describe('materializeFaqs', () => {
  const suggested = [{ ...faq('s1', ['horario']), enabled: false }]

  it('null significa "nunca las tocó": se ofrecen las sugeridas', () => {
    expect(materializeFaqs(null, suggested).map((f) => f.id)).toEqual(['s1'])
  })

  it('[] significa "decidió que ninguna", y NO se repuebla', () => {
    // Es la diferencia que impide que una FAQ borrada resucite. Copiar la fusión por clave de
    // `materialize` (el mapeo de estados) sería exactamente ese bug.
    expect(materializeFaqs([], suggested)).toEqual([])
  })

  it('devuelve copias, no las mismas referencias que las sugeridas', () => {
    const out = materializeFaqs(null, suggested)
    out[0]!.triggers.push('otro')
    expect(suggested[0]!.triggers).toEqual(['horario'])
  })
})

describe('moveFaq', () => {
  const list = [faq('a', ['x']), faq('b', ['x']), faq('c', ['x'])]

  it('sube y baja', () => {
    expect(moveFaq(list, 1, -1).map((f) => f.id)).toEqual(['b', 'a', 'c'])
    expect(moveFaq(list, 1, 1).map((f) => f.id)).toEqual(['a', 'c', 'b'])
  })

  it('en los extremos no hace nada', () => {
    expect(moveFaq(list, 0, -1).map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(moveFaq(list, 2, 1).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('placeholderErrors con FAQs', () => {
  it('nombra un marcador inexistente de una FAQ encendida', () => {
    const errors = placeholderErrors({
      greetingOpenText: '',
      greetingClosedText: '',
      statusMapping: {},
      greetingPlaceholders: ['menu_link'],
      orderPlaceholders: [],
      faqs: [{ ...faq('a', ['x']), text: 'Hola {cliente}' }],
      faqPlaceholders: ['menu_link', 'hours_line'],
    })
    expect(errors).toContain('{cliente}')
  })

  it('una FAQ apagada no bloquea el guardado', () => {
    const errors = placeholderErrors({
      greetingOpenText: '',
      greetingClosedText: '',
      statusMapping: {},
      greetingPlaceholders: [],
      orderPlaceholders: [],
      faqs: [{ ...faq('a', ['x']), text: 'Hola {cliente}', enabled: false }],
      faqPlaceholders: [],
    })
    expect(errors).toEqual([])
  })
})
