import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import ShiftCalendar from '../ShiftCalendar.vue'
import type { PlannedShift } from '@/services/staff.api'

const TODAY = new Date(2026, 6, 15, 9, 0, 0) // Wed 15 July 2026

function shift(over: Partial<PlannedShift> & { id: string; shift_date: string }): PlannedShift {
  return {
    branch_id: 'b1',
    employee_id: 'e1',
    start_time: '12:00:00',
    end_time: '21:00:00',
    status: 'scheduled',
    origin: 'manual',
    covered_by_employee_id: null,
    note: null,
    ...over,
  }
}

const SHIFTS = [
  shift({ id: 's1', shift_date: '2026-07-06', start_time: '06:00:00', end_time: '14:00:00' }),
  shift({ id: 's2', shift_date: '2026-07-15' }),
  shift({ id: 's3', shift_date: '2026-07-20', start_time: '08:00:00', end_time: '12:00:00' }),
  shift({ id: 's4', shift_date: '2026-07-20', start_time: '14:00:00', end_time: '18:00:00' }),
  shift({ id: 's5', shift_date: '2026-07-20', start_time: '19:00:00', end_time: '22:00:00' }),
]

const mountCalendar = (props: Partial<InstanceType<typeof ShiftCalendar>['$props']> = {}) =>
  mount(ShiftCalendar, {
    props: { shifts: SHIFTS, canManage: true, ...props },
  })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})
afterEach(() => vi.useRealTimers())

describe('ShiftCalendar', () => {
  it('draws a Monday-first month grid of six weeks', () => {
    const wrapper = mountCalendar()
    expect(wrapper.text()).toContain('julio 2026')
    expect(wrapper.findAll('[data-day]')).toHaveLength(42)
    const header = wrapper.text()
    expect(header).toContain('Lun')
    expect(header).toContain('Dom')
  })

  it('shows the shift hours as a compact chip inside the day', () => {
    const cell = mountCalendar().get('[data-day="2026-07-06"]')
    expect(cell.text()).toContain('6–14')
  })

  it('stacks two chips and collapses the rest into a count', () => {
    const cell = mountCalendar().get('[data-day="2026-07-20"]')
    expect(cell.text()).toContain('8–12')
    expect(cell.text()).toContain('14–18')
    expect(cell.text()).not.toContain('19–22')
    expect(cell.text()).toContain('+1 más')
  })

  it('paints every shift on the day rail, including the ones without a chip', () => {
    const rail = mountCalendar().get('[data-day="2026-07-20"]').findAll('span[style]')
    // Three segments: the two chipped shifts and the collapsed one.
    expect(rail).toHaveLength(3)
    // 19:00 starts at 79.16% of the day — the rail keeps the late shift visible.
    expect(rail[2]!.attributes('style')).toContain('79.1')
  })

  it('marks today and dims the filler days from the neighbouring months', () => {
    const wrapper = mountCalendar()
    expect(wrapper.get('[data-day="2026-07-15"]').classes().join(' ')).toContain('ring-ember')
    // June 29 is filler: it renders on the app surface, not on paper.
    expect(wrapper.get('[data-day="2026-06-29"]').classes().join(' ')).toContain('bg-app')
  })

  it('opens a day popover with the full detail and deletes from it', async () => {
    const wrapper = mountCalendar()
    await wrapper.get('[data-day="2026-07-15"]').trigger('click')

    const popover = wrapper.get('[role="dialog"]')
    expect(popover.text()).toContain('12:00–21:00')
    expect(popover.text()).toContain('9 h')
    expect(popover.text()).toContain('Planificado')

    await popover.get('button[aria-label="Eliminar turno"]').trigger('click')
    expect(wrapper.emitted('remove')?.[0]).toEqual(['s2'])
  })

  it('treats an empty day as the fastest way to schedule one', async () => {
    const wrapper = mountCalendar()
    await wrapper.get('[data-day="2026-07-08"]').trigger('click')
    expect(wrapper.emitted('add')?.[0]).toEqual(['2026-07-08'])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('counts the month in shifts and hours, ignoring days off', async () => {
    const wrapper = mountCalendar({
      shifts: [
        shift({ id: 'a', shift_date: '2026-07-02', start_time: '08:00', end_time: '16:00' }),
        shift({ id: 'b', shift_date: '2026-07-03', start_time: '08:00', end_time: '12:30' }),
        shift({ id: 'c', shift_date: '2026-07-04', status: 'day_off' }),
        // Another month: must not count.
        shift({ id: 'd', shift_date: '2026-08-02', start_time: '08:00', end_time: '16:00' }),
      ],
    })
    expect(wrapper.text()).toContain('2 turnos')
    expect(wrapper.text()).toContain('12.5')
  })

  it('navigates months and offers a way back to today', async () => {
    const wrapper = mountCalendar()
    expect(wrapper.text()).not.toContain('Hoy')

    await wrapper.get('button[aria-label="Mes siguiente"]').trigger('click')
    expect(wrapper.text()).toContain('agosto 2026')
    expect(wrapper.text()).toContain('Hoy')

    await wrapper.get('button[aria-label="Mes anterior"]').trigger('click')
    await wrapper.get('button[aria-label="Mes anterior"]').trigger('click')
    expect(wrapper.text()).toContain('junio 2026')
  })

  it('is read-only for an inactive employee, but still readable', async () => {
    const wrapper = mountCalendar({ frozen: true })
    expect(wrapper.text()).not.toContain('Agregar turno')

    await wrapper.get('[data-day="2026-07-08"]').trigger('click')
    expect(wrapper.emitted('add')).toBeUndefined()

    // Existing shifts can still be inspected; they just can't be removed.
    await wrapper.get('[data-day="2026-07-15"]').trigger('click')
    const popover = wrapper.get('[role="dialog"]')
    expect(popover.text()).toContain('12:00–21:00')
    expect(popover.find('button[aria-label="Eliminar turno"]').exists()).toBe(false)
  })

  it('hides every write affordance without staff.manage', async () => {
    const wrapper = mountCalendar({ canManage: false })
    expect(wrapper.text()).not.toContain('Agregar turno')
    await wrapper.get('[data-day="2026-07-08"]').trigger('click')
    expect(wrapper.emitted('add')).toBeUndefined()
  })
})

describe('ShiftCalendar accessibility', () => {
  it('spells out what is on a day instead of announcing "0 turnos"', () => {
    const wrapper = mountCalendar()
    expect(wrapper.get('[data-day="2026-07-08"]').attributes('aria-label')).toContain(
      'sin turnos',
    )
    const busy = wrapper.get('[data-day="2026-07-20"]').attributes('aria-label')!
    expect(busy).toContain('3 turnos')
    expect(busy).toContain('19:00 a 22:00')
    expect(wrapper.get('[data-day="2026-07-15"]').attributes('aria-label')).toContain('un turno')
  })
})
