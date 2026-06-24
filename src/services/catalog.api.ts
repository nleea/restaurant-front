// Typed Catalog API layer over the foundation's Axios instance. Reads require `catalog.read`,
// writes `catalog.manage`. Catalog data is global reference data. Units of measure are the slice
// the restaurant needs (Inventory/Recipes consume them). conversion_factor is a decimal string.
import { http } from '@/lib/http'

export interface Unit {
  id: string
  name: string
  abbreviation: string
  base_unit_id: string | null
  conversion_factor: string | null
}

export interface UnitInput {
  name: string
  abbreviation: string
  base_unit_id?: string | null
  conversion_factor?: string | null
}

export async function listUnits(): Promise<Unit[]> {
  return (await http.get<Unit[]>('/catalog/units')).data
}

export async function createUnit(input: UnitInput): Promise<Unit> {
  return (await http.post<Unit>('/catalog/units', input)).data
}

export async function updateUnit(id: string, patch: Partial<UnitInput>): Promise<Unit> {
  return (await http.patch<Unit>(`/catalog/units/${id}`, patch)).data
}
