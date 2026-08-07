// La pantalla de configuración.
//
// El caso que importa es el colchón de recuperación: que no se pueda poner a cero, y que se
// explique por la repetición que evita en vez de por su nombre técnico. Cero no es una
// preferencia del usuario — es el bug que la histéresis existe para impedir.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  listAlerts: vi.fn<(...a: unknown[]) => unknown>(),
  acknowledgeAlert: vi.fn<(...a: unknown[]) => unknown>(),
  listRules: vi.fn<(...a: unknown[]) => unknown>(),
  saveRule: vi.fn<(...a: unknown[]) => unknown>(),
  getEscalationReach: vi.fn<(...a: unknown[]) => unknown>(),
}))
vi.mock('@/services/alerts.api', () => apiMock)

const branchMock = vi.hoisted(() => ({ listBranches: vi.fn<(...a: unknown[]) => unknown>() }))
vi.mock('@/services/branch.api', () => branchMock)

vi.mock('@/components/AppShell.vue', () => ({
  default: { name: 'AppShell', template: '<div><slot /></div>' },
}))

import AlertRulesView from '../AlertRulesView.vue'

const rule = (over: Record<string, unknown> = {}) => ({
  rule_key: 'low_stock',
  is_enabled: true,
  threshold: null,
  recovery_buffer: 2,
  remind_every_minutes: 5,
  escalation_after_minutes: 30,
  escalate_to_whatsapp: false,
  ...over,
})

async function mountView() {
  const wrapper = mount(AlertRulesView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  apiMock.listRules.mockResolvedValue([rule()])
  apiMock.saveRule.mockImplementation((_b: unknown, r: unknown) => Promise.resolve(r))
  branchMock.listBranches.mockResolvedValue([
    { id: 'b1', code: 'CENTRO', name: 'Sede Centro', is_primary: true },
  ])
  // El diagnóstico lo da el backend: sabe contar teléfonos y contactabilidad, cosas que la
  // pantalla no puede ver por su cuenta.
  apiMock.getEscalationReach.mockResolvedValue({
    has_session: true,
    subscribed: 2,
    with_chat: 2,
    reachable: 2,
  })
})

describe('AlertRulesView', () => {
  it('explica el colchón por la repetición que evita, no por su nombre', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('no vuelve a sonar')
    expect(wrapper.text()).toContain('avise cuarenta veces')
  })

  it('rechaza un colchón de cero y bloquea el guardado', async () => {
    const wrapper = await mountView()

    await wrapper.get('[data-testid="recovery-buffer"]').setValue('0')

    expect(wrapper.get('[data-testid="buffer-error"]').text()).toContain('mayor que cero')
    expect(wrapper.get('[data-testid="save-rule"]').attributes('disabled')).toBeDefined()
  })

  it('un colchón válido vuelve a habilitar el guardado', async () => {
    const wrapper = await mountView()
    const input = wrapper.get('[data-testid="recovery-buffer"]')
    await input.setValue('0')
    expect(wrapper.get('[data-testid="save-rule"]').attributes('disabled')).toBeDefined()

    await input.setValue('3')

    expect(wrapper.find('[data-testid="buffer-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="save-rule"]').attributes('disabled')).toBeUndefined()
  })

  it('las reglas llegan apagadas y sin campos que llenar', async () => {
    apiMock.listRules.mockResolvedValue([rule({ is_enabled: false })])
    const wrapper = await mountView()
    // Instalar el módulo no interrumpe a nadie: encender es una decisión explícita.
    expect(wrapper.find('[data-testid="recovery-buffer"]').exists()).toBe(false)
  })

  it('deshabilita el escalado sin número conectado, y dice qué hacer', async () => {
    apiMock.getEscalationReach.mockResolvedValue({
      has_session: false,
      subscribed: 0,
      with_chat: 0,
      reachable: 0,
    })
    const wrapper = await mountView()

    expect(wrapper.get('[data-testid="escalate-toggle"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="reach"]').text()).toContain('no tiene un número')
  })

  it('con número pero sin nadie señalado, manda a Personal', async () => {
    apiMock.getEscalationReach.mockResolvedValue({
      has_session: true,
      subscribed: 0,
      with_chat: 0,
      reachable: 0,
    })
    const wrapper = await mountView()

    // Elegir a quién se avisa es un paso explícito: sin él no le llega a nadie.
    expect(wrapper.get('[data-testid="reach"]').text()).toContain('Nadie está señalado')
    expect(wrapper.get('[data-testid="escalate-toggle"]').attributes('disabled')).toBeDefined()
  })

  it('con gente señalada pero sin chat emparejado, lo dice aparte', async () => {
    apiMock.getEscalationReach.mockResolvedValue({
      has_session: true,
      subscribed: 2,
      with_chat: 0,
      reachable: 0,
    })
    const wrapper = await mountView()

    // Es una causa distinta de "no hay nadie señalado" y se arregla en otro sitio.
    expect(wrapper.get('[data-testid="reach"]').text()).toContain('ninguna tiene su chat')
  })

  it('explica la causa que nadie adivina: nadie ha escrito al número', async () => {
    // Todo configurado y aun así no llegaría. Es EL caso que hace parecer que está roto.
    apiMock.getEscalationReach.mockResolvedValue({
      has_session: true,
      subscribed: 3,
      with_chat: 3,
      reachable: 0,
    })
    const wrapper = await mountView()

    const text = wrapper.get('[data-testid="reach"]').text()
    // Los chats emparejados dejaron de servir: se vuelve a emparejar, no se teclea nada.
    expect(text).toContain('Vuelve a emparejarlos')
    expect(wrapper.get('[data-testid="escalate-toggle"]').attributes('disabled')).toBeDefined()
  })

  it('cuando sí llegaría, lo dice con el número y deja encenderlo', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('[data-testid="reach"]').text()).toContain('Le llegaría a 2 personas')
    expect(wrapper.get('[data-testid="escalate-toggle"]').attributes('disabled')).toBeUndefined()
  })

  it('la regla de sesión caída no pide colchón: reconectar re-arma', async () => {
    apiMock.listRules.mockResolvedValue([rule({ rule_key: 'whatsapp_session_down' })])
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="recovery-buffer"]').exists()).toBe(false)
  })

  it('la de caja abierta pide la hora a partir de la cual avisa', async () => {
    apiMock.listRules.mockResolvedValue([rule({ rule_key: 'cash_session_left_open', threshold: 23 })])
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="threshold"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Hora a partir de la cual avisa')
  })

  it('guarda la regla editada', async () => {
    const wrapper = await mountView()
    await wrapper.get('[data-testid="recovery-buffer"]').setValue('7')
    await wrapper.get('[data-testid="save-rule"]').trigger('click')
    await flushPromises()

    const sent = apiMock.saveRule.mock.calls[0]?.[1] as { recovery_buffer: number }
    expect(sent.recovery_buffer).toBe(7)
  })

  it('repite el mensaje del backend cuando el guardado se cae', async () => {
    apiMock.saveRule.mockRejectedValue({
      response: { status: 422, data: { detail: 'El colchón no puede ser cero.' } },
    })
    const wrapper = await mountView()
    await wrapper.get('[data-testid="save-rule"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="error"]').text()).toContain('colchón')
  })
})

// --- La unidad del colchón ---------------------------------------------------
// El defecto de origen no fue el cálculo: fue un número sin unidad. Un colchón cuya unidad no se
// dice es un colchón que nadie puede poner bien — ajustarlo para el camarón lo rompía para la sal.
describe('la unidad del colchón', () => {
  it('el stock bajo lo dice en porcentaje, no en cantidades', async () => {
    apiMock.listRules.mockResolvedValue([rule({ recovery_buffer: 10 })])
    const text = (await mountView()).text()

    expect(text).toContain('%')
    // "unidades" era la copia vieja, y era mentira: cada insumo tiene su unidad de medida.
    expect(text).not.toContain('unidades por encima del mínimo')
  })

  it('traduce el porcentaje a dos casos concretos, que es lo que se entiende', async () => {
    apiMock.listRules.mockResolvedValue([rule({ recovery_buffer: 10 })])
    const text = (await mountView()).text()

    // Mínimo 2 → 2,2. Mínimo 500 → 550. Un porcentaje abstracto no le dice nada a nadie.
    expect(text).toContain('2,2')
    expect(text).toContain('550')
  })

  it('el ejemplo sigue al valor que el usuario escribe', async () => {
    apiMock.listRules.mockResolvedValue([rule({ recovery_buffer: 10 })])
    const wrapper = await mountView()

    await wrapper.get('[data-testid="recovery-buffer"]').setValue('50')

    // Mínimo 2 + 50% = 3.
    expect(wrapper.text()).toContain('de 3')
  })

  it('la caja abierta sigue midiendo su colchón en minutos', async () => {
    apiMock.listRules.mockResolvedValue([
      rule({ rule_key: 'cash_session_left_open', threshold: 23, recovery_buffer: 30 }),
    ])
    const text = (await mountView()).text()

    expect(text).toContain('minutos')
    // Y no se le cuela el ejemplo del stock: ahí el colchón no es un porcentaje.
    expect(text).not.toContain('midas kilos')
  })

  it('la cuota del asistente sigue en puntos porcentuales', async () => {
    apiMock.listRules.mockResolvedValue([
      rule({ rule_key: 'assistant_quota', threshold: 80, recovery_buffer: 5 }),
    ])
    expect((await mountView()).text()).toContain('puntos porcentuales')
  })
})

// --- Cada cuánto insiste ------------------------------------------------------
// El defecto que arregla este change: el módulo avisaba UNA vez y callaba para siempre, así que
// una alerta que salta cuando nadie mira la pantalla se perdía entera.
describe('el intervalo de recordatorio', () => {
  it('se guarda con la regla', async () => {
    apiMock.listRules.mockResolvedValue([rule({ remind_every_minutes: 5 })])
    apiMock.saveRule.mockResolvedValue(rule({ remind_every_minutes: 15 }))
    const wrapper = await mountView()

    await wrapper.get('[data-testid="remind-every"]').setValue('15')
    await wrapper.get('[data-testid="save-rule"]').trigger('click')
    await flushPromises()

    expect(apiMock.saveRule).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ remind_every_minutes: 15 }),
    )
  })

  it('el cero se presenta como una elección, no como un hueco', async () => {
    apiMock.listRules.mockResolvedValue([rule({ remind_every_minutes: 0 })])
    const text = (await mountView()).text()

    expect(text).toContain('avisa una vez')
    // Y se dice lo que cuesta: es la información que hace que la elección sea informada.
    expect(text).toContain('se pierde')
  })

  it('avisa del suelo del barrido en vez de rechazar el valor', async () => {
    // Rechazarlo acoplaría el formulario a una constante del worker; el día que el barrido baje
    // a 1 minuto, las validaciones guardadas mentirían.
    apiMock.listRules.mockResolvedValue([rule({ remind_every_minutes: 1 })])
    expect((await mountView()).text()).toContain('llegan igual cada 5')
  })

  it('un intervalo por encima del suelo no avisa de nada', async () => {
    apiMock.listRules.mockResolvedValue([rule({ remind_every_minutes: 30 })])
    expect((await mountView()).text()).not.toContain('llegan igual cada')
  })
})

// --- WhatsApp: los dos relojes -------------------------------------------------
describe('el ritmo de WhatsApp', () => {
  it('dice que insiste cada 4 horas y que ese ritmo no se configura', async () => {
    apiMock.listRules.mockResolvedValue([rule()])
    const text = (await mountView()).text()

    expect(text).toContain('4 horas')
    expect(text).toContain('6 mensajes al día')
    // La razón, que es lo que impide que alguien pida el ajuste: protege al número, no a la regla.
    expect(text).toContain('protege al número')
  })
})
