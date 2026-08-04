// The note affordance the waiter actually touches: the button on the dupe line, and the
// sheet it opens. Guards the reason this exists — the old field was a cramped inline input.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DupeLine from '../DupeLine.vue'
import NoteSheet from '../NoteSheet.vue'

const LINE = {
  id: 'i1',
  name: 'Hamburguesa Doble',
  unitPrice: 15000,
  qty: 1,
  lineTotal: 15000,
  sent: false,
  note: null as string | null,
}

function dupe(line: Partial<typeof LINE> = {}, editable = true) {
  return mount(DupeLine, {
    props: { line: { ...LINE, ...line }, flash: false, editable },
  })
}

describe('DupeLine note affordance', () => {
  it('offers "Nota" on a line that has none, and emits on tap', async () => {
    const w = dupe()
    const btn = w.find('button[aria-label="Agregar una nota a Hamburguesa Doble"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('Nota')

    await btn.trigger('click')
    expect(w.emitted('note')).toHaveLength(1)
  })

  it('shows an existing note as the edit affordance rather than dead text', async () => {
    const w = dupe({ note: 'sin cebolla' })
    const btn = w.find('button[aria-label="Editar la nota de Hamburguesa Doble"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('sin cebolla')

    await btn.trigger('click')
    expect(w.emitted('note')).toHaveLength(1)
  })

  it('renders the note as plain text when the dupe is not editable', () => {
    const w = dupe({ note: 'sin cebolla' }, false)
    expect(w.text()).toContain('sin cebolla')
    // No note button on a closed order / read-only user.
    expect(w.find('button[aria-label*="nota"]').exists()).toBe(false)
  })
})

describe('NoteSheet', () => {
  // The sheet teleports to <body> (it can live inside the mobile dupe's stacking context);
  // stub the teleport so assertions stay on the wrapper.
  function sheet(props: Partial<InstanceType<typeof NoteSheet>['$props']> = {}) {
    return mount(NoteSheet, {
      props: { itemName: 'Hamburguesa Doble', note: null, ...props },
      global: { stubs: { teleport: true } },
    })
  }

  it('is a real textarea seeded with the current note', () => {
    const w = sheet({ note: 'sin cebolla' })
    const ta = w.find('textarea')
    expect(ta.exists()).toBe(true)
    expect((ta.element as HTMLTextAreaElement).value).toBe('sin cebolla')
  })

  it('saves the trimmed note', async () => {
    const w = sheet()
    await w.find('textarea').setValue('  sin cebolla  ')
    await w.findAll('button').find((b) => b.text().includes('Guardar'))!.trigger('click')
    expect(w.emitted('save')).toEqual([['sin cebolla']])
  })

  it('saves null when the field is emptied, so the note is cleared', async () => {
    const w = sheet({ note: 'sin cebolla' })
    await w.find('textarea').setValue('   ')
    await w.findAll('button').find((b) => b.text().includes('Guardar'))!.trigger('click')
    expect(w.emitted('save')).toEqual([[null]])
  })

  it('will not save an unchanged note — a no-op tap must not hit the network', async () => {
    const w = sheet({ note: 'sin cebolla' })
    const save = w.findAll('button').find((b) => b.text().includes('Guardar'))!
    expect((save.element as HTMLButtonElement).disabled).toBe(true)
    await save.trigger('click')
    expect(w.emitted('save')).toBeUndefined()
  })

  it('blocks a note past the backend 255-char limit', async () => {
    const w = sheet()
    await w.find('textarea').setValue('x'.repeat(256))
    const save = w.findAll('button').find((b) => b.text().includes('Guardar'))!
    expect((save.element as HTMLButtonElement).disabled).toBe(true)
    expect(w.text()).toContain('256/255')
  })

  it('closes on Escape and on Cancelar', async () => {
    const w = sheet()
    await w.findAll('button').find((b) => b.text().includes('Cancelar'))!.trigger('click')
    expect(w.emitted('close')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(w.emitted('close')).toHaveLength(2)
  })

  it('surfaces a save failure instead of closing silently', () => {
    const w = sheet({ error: 'No se pudo guardar la nota.' })
    expect(w.find('[role="alert"]').text()).toContain('No se pudo guardar la nota.')
  })
})
