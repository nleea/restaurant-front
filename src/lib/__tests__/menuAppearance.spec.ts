import { describe, expect, it } from 'vitest'
import {
  GRID_COLUMNS,
  blockCells,
  findFreeCell,
  fitsInGrid,
  gridToLinearOrder,
  overlaps,
  removableIngredientsFor,
  type Block,
} from '@/lib/menuAppearance'

function block(id: Block['id'], x: number, y: number, size: Block['size'], visible = true): Block {
  return { id, position: { x, y }, size, visible }
}

describe('blockCells', () => {
  it('covers w×h cells from the top-left', () => {
    expect(blockCells(block('banner', 1, 2, 'large')).sort()).toEqual(
      ['1,2', '1,3', '2,2', '2,3'].sort(),
    )
    expect(blockCells(block('search', 0, 0, 'small'))).toEqual(['0,0'])
    expect(blockCells(block('footer', 0, 0, 'medium')).sort()).toEqual(['0,0', '1,0'].sort())
  })
})

describe('fitsInGrid', () => {
  it('keeps a block within the column count', () => {
    // large (w=2) can start at x=0..2 on a 4-col grid, not x=3.
    expect(fitsInGrid({ x: 2, y: 0 }, 'large')).toBe(true)
    expect(fitsInGrid({ x: 3, y: 0 }, 'large')).toBe(false)
    expect(fitsInGrid({ x: GRID_COLUMNS - 1, y: 0 }, 'small')).toBe(true)
    expect(fitsInGrid({ x: -1, y: 0 }, 'small')).toBe(false)
  })
})

describe('overlaps', () => {
  const others = [block('banner', 0, 0, 'large')] // covers 0,0 0,1 1,0 1,1

  it('detects a collision with an existing block', () => {
    expect(overlaps({ id: 'search', position: { x: 1, y: 1 }, size: 'small' }, others)).toBe(true)
  })
  it('allows a placement in free cells', () => {
    expect(overlaps({ id: 'search', position: { x: 2, y: 0 }, size: 'small' }, others)).toBe(false)
  })
  it('ignores the block being moved (same id)', () => {
    expect(overlaps({ id: 'banner', position: { x: 0, y: 0 }, size: 'large' }, others)).toBe(false)
  })
  it('ignores hidden blocks', () => {
    const hidden = [block('banner', 0, 0, 'large', false)]
    expect(overlaps({ id: 'search', position: { x: 0, y: 0 }, size: 'small' }, hidden)).toBe(false)
  })
})

describe('findFreeCell', () => {
  it('returns a cell that does not overlap and fits', () => {
    const blocks = [block('banner', 0, 0, 'large'), block('featured_categories', 2, 0, 'medium')]
    const pos = findFreeCell('medium', blocks, 'search')
    expect(fitsInGrid(pos, 'medium')).toBe(true)
    expect(overlaps({ id: 'search', position: pos, size: 'medium' }, blocks)).toBe(false)
  })
})

describe('gridToLinearOrder', () => {
  it('sorts visible blocks top-to-bottom then left-to-right', () => {
    const blocks = [
      block('footer', 2, 2, 'medium'),
      block('banner', 0, 0, 'large'),
      block('search', 2, 1, 'medium'),
      block('featured_categories', 2, 0, 'medium'),
    ]
    expect(gridToLinearOrder(blocks).map((b) => b.id)).toEqual([
      'banner',
      'featured_categories',
      'search',
      'footer',
    ])
  })

  it('drops hidden blocks from the reading order', () => {
    const blocks = [block('banner', 0, 0, 'large'), block('search', 2, 0, 'small', false)]
    expect(gridToLinearOrder(blocks).map((b) => b.id)).toEqual(['banner'])
  })
})

describe('removableIngredientsFor', () => {
  const names: Record<string, string> = { i1: 'Cebolla', i2: 'Salsa rosada', i3: 'Limón' }
  const nameOf = (id: string): string | undefined => names[id]

  it('maps recipe items to ingredient names', () => {
    const items = [{ ingredient_id: 'i1' }, { ingredient_id: 'i2' }]
    expect(removableIngredientsFor(items, nameOf)).toEqual(['Cebolla', 'Salsa rosada'])
  })

  it('dedupes repeated ingredients and preserves first-seen order', () => {
    const items = [{ ingredient_id: 'i3' }, { ingredient_id: 'i1' }, { ingredient_id: 'i3' }]
    expect(removableIngredientsFor(items, nameOf)).toEqual(['Limón', 'Cebolla'])
  })

  it('drops ids that resolve to no name, and returns [] for no recipe', () => {
    expect(removableIngredientsFor([{ ingredient_id: 'unknown' }], nameOf)).toEqual([])
    expect(removableIngredientsFor(undefined, nameOf)).toEqual([])
  })

  it('filters out non-customer-removable staples when a predicate is given', () => {
    const items = [{ ingredient_id: 'i1' }, { ingredient_id: 'i2' }, { ingredient_id: 'i3' }]
    // i2 (Salsa rosada) is a staple the customer must not exclude.
    const isRemovable = (id: string): boolean => id !== 'i2'
    expect(removableIngredientsFor(items, nameOf, isRemovable)).toEqual(['Cebolla', 'Limón'])
  })
})
