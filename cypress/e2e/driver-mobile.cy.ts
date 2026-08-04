// La vista del domiciliario en un teléfono de verdad.
//
// Existe por un motivo concreto: `/driver` es la ÚNICA pantalla de la app que se usa siempre en
// un móvil, a una mano, en la calle — y es la única cuyo ancho no puede fallar. Un scroll
// horizontal en el escritorio es feo; aquí es un botón que se sale de la pantalla mientras
// alguien espera en una puerta.
//
// jsdom no hace layout, así que esto no se puede probar con vitest: hay que medir en un navegador
// real. Lo que se mide es una sola cosa y es objetiva — que nada sea más ancho que la pantalla —,
// y cuando falla, el test DICE QUÉ ELEMENTO se sale, que es lo que convierte el fallo en un
// arreglo en vez de en una cacería.

const PHONES = [
  { name: 'iPhone SE / Android pequeño', width: 320, height: 568 },
  { name: 'iPhone 12/13/14', width: 390, height: 844 },
  { name: 'Android típico', width: 360, height: 800 },
]

// Datos HOSTILES pero reales. Cada uno es un caso que existe en Riohacha:
//  · una dirección larga sin abreviar, que es como la escribe un cliente;
//  · un nombre completo de verdad, no "Ana";
//  · una recaudación de siete cifras, que es un día normal de domicilios.
const LONG_ADDRESS = 'Carrera 15 #45-67 Conjunto Residencial Villa Campestre Torre B Apto 1203'
const LONG_NAME = 'María Fernanda Gutiérrez Villalobos'

function stop(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    order_id: 'o1',
    address_text: LONG_ADDRESS,
    neighborhood: 'Villa Campestre Norte',
    latitude: '11.5385',
    longitude: '-72.9128',
    delivery_status: 'in_transit',
    route_position: 1,
    notes: 'Timbre dañado, llamar al llegar por favor',
    not_delivered_reason: null,
    delivered_at: null,
    order_code: 'A3F2',
    customer_name: LONG_NAME,
    customer_phone: '+57 300 111 2233',
    total: '1250000.00',
    payment_method: 'efectivo',
    paid: false,
    items: [{ name: 'Bandeja paisa con chicharrón extra y arepa', quantity: 2 }],
    ...over,
  }
}

const RUN = {
  id: 'r1',
  delivery_route_id: 'rt1',
  employee_id: 'e1',
  status: 'in_transit',
  departed_at: '2026-08-01T18:00:00Z',
  finished_at: null,
  created_at: '2026-08-01T17:30:00Z',
  stops: [
    stop(),
    stop({
      id: 'd2',
      route_position: 2,
      delivery_status: 'delivered',
      delivered_at: '2026-08-01T18:20:00Z',
      paid: true,
      order_code: 'B7K1',
    }),
    stop({
      id: 'd3',
      route_position: 3,
      delivery_status: 'not_delivered',
      delivered_at: '2026-08-01T18:40:00Z',
      not_delivered_reason: 'El cliente no estaba en la dirección indicada',
      order_code: 'C2M9',
    }),
  ],
}

/**
 * Todo lo que sobresale del ancho de la pantalla, con lo justo para reconocerlo.
 *
 * Se mide contra `documentElement.clientWidth` (el viewport SIN la barra de scroll) y se ignora
 * lo que está oculto: un elemento con `display:none` no rompe nada.
 */
function offenders(win: Window): { tag: string; cls: string; text: string; right: number }[] {
  const limit = win.document.documentElement.clientWidth
  const out: { tag: string; cls: string; text: string; right: number }[] = []
  win.document.querySelectorAll('body *').forEach((node) => {
    const el = node as HTMLElement
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    // Sólo el elemento MÁS PROFUNDO que se sale interesa: si un padre se sale es porque un hijo
    // lo empuja, y culpar al padre manda a arreglar el sitio equivocado.
    if (rect.right <= limit + 0.5) return
    if ([...el.children].some((c) => c.getBoundingClientRect().right > limit + 0.5)) return
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 160),
      text: (el.textContent || '').trim().slice(0, 60),
      right: Math.round(rect.right),
    })
  })
  return out
}

function signIn(): void {
  cy.window().then((win) => {
    win.localStorage.setItem('auth.access_token', 'test-token')
    win.localStorage.setItem('auth.refresh_token', 'test-refresh')
  })
}

function stubApi(run: unknown = RUN): void {
  cy.intercept('GET', '**/api/auth/me', {
    body: {
      id: 'u1',
      email: 'moto@demo.com',
      name: 'Jhon Alexander Barros Epieyú',
      permissions: ['delivery.drive'],
    },
  })
  cy.intercept('GET', '**/api/branches*', {
    body: [{ id: 'b1', code: 'centro', name: 'Centro', is_active: true, is_primary: true }],
  })
  cy.intercept('GET', '**/api/delivery/me/run*', { body: run })
  // El stream en vivo: se corta para que el test no dependa de la red ni reintente en bucle.
  cy.intercept('GET', '**/api/delivery/events*', { statusCode: 204, body: '' })
}

describe('la vista del domiciliario cabe en un teléfono', () => {
  PHONES.forEach((phone) => {
    describe(`${phone.name} (${phone.width}px)`, () => {
      beforeEach(() => {
        cy.viewport(phone.width, phone.height)
        cy.visit('/login')
        signIn()
        stubApi()
      })

      it('Inicio no se sale de ancho', () => {
        cy.visit('/driver')
        cy.contains('Paradas').should('be.visible')
        cy.window().then((win) => {
          const doc = win.document.documentElement
          const bad = offenders(win)
          expect(
            bad,
            `viewport=${doc.clientWidth} scrollWidth=${doc.scrollWidth}\n` +
              `elementos que se salen: ${JSON.stringify(bad, null, 2)}`,
          ).to.be.empty
          expect(doc.scrollWidth).to.be.at.most(doc.clientWidth)
        })
      })

      it('el detalle de una parada no se sale de ancho', () => {
        cy.visit('/driver')
        cy.contains(LONG_ADDRESS).first().click()
        cy.contains('Dirección').should('be.visible')
        cy.window().then((win) => {
          const bad = offenders(win)
          expect(bad, `elementos que se salen: ${JSON.stringify(bad, null, 2)}`).to.be.empty
        })
      })

      it('Mi día no se sale de ancho', () => {
        cy.visit('/driver')
        cy.contains('Mi día').click()
        cy.contains('Resumen de hoy').should('be.visible')
        cy.window().then((win) => {
          const bad = offenders(win)
          expect(bad, `elementos que se salen: ${JSON.stringify(bad, null, 2)}`).to.be.empty
        })
      })
    })
  })

  // El cliente escribe la dirección a mano, y la escribe SIN ESPACIOS más veces de las que
  // parece: "Cra15#45-67TorreBApto1203". Un texto así no tiene dónde partirse, así que cualquier
  // sitio que lo pinte sin permitir el corte se sale de la pantalla — y el sitio donde más grande
  // se pinta es el titular de la siguiente parada.
  it('una dirección sin espacios tampoco se sale', () => {
    const UNBREAKABLE = 'Cra15#45-67ConjuntoVillaCampestreTorreBApartamento1203Riohacha'
    cy.viewport(320, 568)
    cy.visit('/login')
    signIn()
    stubApi({
      ...RUN,
      stops: [stop({ address_text: UNBREAKABLE, customer_name: 'MaríaFernandaGutiérrezVillalobos' })],
    })
    cy.visit('/driver')
    cy.contains('Siguiente pedido').should('be.visible')
    cy.window().then((win) => {
      const bad = offenders(win)
      expect(bad, `elementos que se salen: ${JSON.stringify(bad, null, 2)}`).to.be.empty
      expect(win.document.documentElement.scrollWidth).to.be.at.most(
        win.document.documentElement.clientWidth,
      )
    })
  })

  // El nombre del domiciliario va en la cabecera oscura y lo escribe RRHH, no el sistema.
  it('un nombre largo en la cabecera no empuja la pantalla', () => {
    cy.viewport(320, 568)
    cy.visit('/login')
    cy.window().then((win) => {
      win.localStorage.setItem('auth.access_token', 'test-token')
      win.localStorage.setItem('auth.refresh_token', 'test-refresh')
    })
    cy.intercept('GET', '**/api/auth/me', {
      body: {
        id: 'u1',
        email: 'moto@demo.com',
        name: 'JhonAlexanderBarrosEpieyúGutiérrezVillalobos',
        permissions: ['delivery.drive'],
      },
    })
    cy.intercept('GET', '**/api/branches*', {
      body: [{ id: 'b1', code: 'centro', name: 'Centro', is_active: true, is_primary: true }],
    })
    cy.intercept('GET', '**/api/delivery/me/run*', { body: RUN })
    cy.intercept('GET', '**/api/delivery/events*', { statusCode: 204, body: '' })
    cy.visit('/driver')
    cy.contains('Domiciliario').should('be.visible')
    cy.window().then((win) => {
      const bad = offenders(win)
      expect(bad, `elementos que se salen: ${JSON.stringify(bad, null, 2)}`).to.be.empty
    })
  })

  // El botón que cierra la parada es el gesto que el domiciliario hace en la puerta, con el
  // cliente delante. Si queda debajo de la barra del navegador, la entrega no se puede cerrar.
  it('los botones de la hoja quedan dentro de la pantalla visible', () => {
    cy.viewport(390, 844)
    cy.visit('/login')
    signIn()
    stubApi()
    cy.visit('/driver')
    cy.contains(LONG_ADDRESS).first().click()
    cy.get('[data-deliver]').then(($btn) => {
      cy.window().then((win) => {
        const rect = $btn[0]!.getBoundingClientRect()
        expect(rect.bottom, 'el botón de entregar se sale por abajo').to.be.at.most(
          win.innerHeight + 0.5,
        )
        expect(rect.top, 'el botón de entregar se sale por arriba').to.be.at.least(-0.5)
      })
    })
  })
})
