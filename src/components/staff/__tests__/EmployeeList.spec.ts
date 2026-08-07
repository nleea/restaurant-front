import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import EmployeeList from '../EmployeeList.vue'
import { useStaffStore } from '@/stores/staff'
import { useBranchStore } from '@/stores/branch'
import type { Employee } from '@/services/staff.api'

function employee(over: Partial<Employee> & { id: string; user_id: string }): Employee {
  return {
    branch_id: 'b1',
    person_id: 'p1',
    role_id: 'r-barista',
    hired_at: null,
    is_active: true,
    ...over,
  }
}

const ANA = employee({ id: 'e1', user_id: 'u1', role_id: 'r-manager' })
const BRUNO = employee({ id: 'e2', user_id: 'u2', is_active: false })
const CARLA = employee({ id: 'e3', user_id: 'u3' })

const BASE_PROPS: InstanceType<typeof EmployeeList>['$props'] = {
  employees: [ANA, BRUNO, CARLA],
  selectedId: null,
  activeOnly: false,
  canManage: true,
  loading: false,
  error: null,
  hasActiveBranch: true,
}

function mountList(props: Partial<typeof BASE_PROPS> = {}) {
  return mount(EmployeeList, {
    props: { ...BASE_PROPS, ...props },
    global: { stubs: { Button: true } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  const staff = useStaffStore()
  const user = (id: string, name: string, email: string) => ({
    id,
    name,
    email,
    username: email,
    is_active: true,
    last_login_at: null,
  })
  staff.usersById = {
    u1: user('u1', 'Ana Restrepo', 'ana@demo.com'),
    u2: user('u2', 'Bruno Díaz', 'bruno@demo.com'),
    u3: user('u3', '', 'carla@demo.com'),
  }
  const role = (id: string, name: string) => ({
    id,
    name,
    description: null,
    is_global: false,
    is_active: true,
    tenant_id: 't1',
  })
  staff.roles = [role('r-manager', 'Manager'), role('r-barista', 'Barista')]
  useBranchStore().branches = [
    { id: 'b1', name: 'Sede Centro', code: 'centro', is_primary: true },
  ]
})

describe('EmployeeList', () => {
  it('gives every card a name, an initials avatar, a role and a branch', () => {
    const card = mountList().findAll('li')[0]!
    expect(card.text()).toContain('Ana Restrepo')
    expect(card.text()).toContain('AR')
    expect(card.text()).toContain('Manager')
    expect(card.text()).toContain('Sede Centro')
  })

  it('falls back to the email when a person has no name yet', () => {
    expect(mountList().text()).toContain('CA')
  })

  it('leads with active staff, then sorts by name', () => {
    const names = mountList()
      .findAll('li')
      .map((li) => li.text())
    expect(names[0]).toContain('Ana Restrepo')
    expect(names[1]).toContain('carla@demo.com')
    // The inactive employee falls to the bottom regardless of alphabet.
    expect(names[2]).toContain('Bruno Díaz')
  })

  it('renders an inactive employee as switched off, not merely tagged', () => {
    const cards = mountList().findAll('li button')
    const bruno = cards.find((c) => c.text().includes('Bruno'))!
    const ana = cards.find((c) => c.text().includes('Ana'))!
    expect(bruno.classes()).toContain('opacity-60')
    expect(bruno.classes()).toContain('grayscale')
    expect(bruno.text()).toContain('Inactivo')
    expect(ana.classes()).not.toContain('grayscale')
  })

  it('marks the selected card', () => {
    const wrapper = mountList({ selectedId: 'e1' })
    const ana = wrapper.findAll('li button').find((c) => c.text().includes('Ana'))!
    expect(ana.classes()).toContain('border-ember')
  })

  it('emits the employee that was tapped', async () => {
    const wrapper = mountList()
    await wrapper.findAll('li button')[0]!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([ANA])
  })

  it('round-trips the "Solo activos" switch and says how many are hidden', async () => {
    const wrapper = mountList({ activeOnly: true, employees: [ANA, CARLA] })
    // The count comes from the caller's list; filtered lists report nothing hidden.
    expect(wrapper.text()).toContain('Solo activos')

    await wrapper.get('button[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:activeOnly')?.[0]).toEqual([false])
  })

  it('reports the hidden inactive staff when the filter is on', () => {
    const wrapper = mountList({ activeOnly: true })
    expect(wrapper.text()).toContain('1 oculto')
  })

  it('hides the create action without staff.manage', () => {
    expect(mountList({ canManage: false }).find('button-stub').exists()).toBe(false)
  })

  it('explains an empty or broken state instead of showing a blank column', () => {
    expect(mountList({ employees: [] }).text()).toContain('No hay empleados')
    expect(mountList({ error: 'No se pudo cargar el personal.' }).text()).toContain(
      'No se pudo cargar el personal.',
    )
    expect(mountList({ hasActiveBranch: false }).text()).toContain('no tiene sucursales')
  })
})
