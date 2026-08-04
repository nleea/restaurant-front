import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import BranchPicker from '../BranchPicker.vue'

const BRANCHES = [
  { id: '1', code: 'centro', name: 'Sede Centro', address: 'Cra 1 #2-3', phone: '3001112233' },
  { id: '2', code: 'norte', name: 'Sede Norte', address: null, phone: null },
]

describe('BranchPicker', () => {
  it('lists the branches with their address', () => {
    const wrapper = mount(BranchPicker, { props: { branches: BRANCHES } })
    const text = wrapper.text()
    expect(text).toContain('Sede Centro')
    expect(text).toContain('Cra 1 #2-3')
    expect(text).toContain('Sede Norte')
  })

  it('emits the code of the chosen branch', async () => {
    const wrapper = mount(BranchPicker, { props: { branches: BRANCHES } })
    await wrapper.get('[data-branch-code="norte"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['norte'])
  })

  it('explains a bad link instead of showing a menu from another branch', () => {
    const wrapper = mount(BranchPicker, { props: { branches: BRANCHES, notFound: true } })
    expect(wrapper.text()).toContain('No encontramos esa sede')
    // The recovery affordance is still there.
    expect(wrapper.text()).toContain('Sede Centro')
  })

  it('asks which branch when arriving without a code', () => {
    const wrapper = mount(BranchPicker, { props: { branches: BRANCHES } })
    expect(wrapper.text()).toContain('¿De cuál sede quieres pedir?')
  })

  it('says so when there is nothing to pick', () => {
    const wrapper = mount(BranchPicker, { props: { branches: [] } })
    expect(wrapper.text()).toContain('No hay sedes disponibles')
  })
})
