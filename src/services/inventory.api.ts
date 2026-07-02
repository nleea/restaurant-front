// Typed Inventory API layer over the foundation's Axios instance. All paths are branch-scoped in
// the URL (`/inventory/branches/{branchId}/...`). Reads require `inventory.read`; thresholds,
// movements and recounts require `inventory.adjust`. Quantity fields are server-side decimals
// serialized as strings ("1.500") and kept verbatim in transit; only the display layer reformats.
// Stock and movements carry only `ingredient_id` — names/units are resolved client-side (store).
import { http } from '@/lib/http'

export const MOVEMENT_TYPES = ['in', 'out'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export interface Stock {
  id: string
  branch_id: string
  ingredient_id: string
  current_quantity: string
  min_stock: string
  updated_at: string | null
}

export interface Movement {
  id: string
  branch_id: string
  ingredient_id: string
  type: string
  reason: string
  quantity: string
  employee_id: string
  reference_id: string | null
  notes: string | null
  created_at: string | null
}

export interface SetThresholdInput {
  ingredient_id: string
  min_stock: string
}

export interface RegisterMovementInput {
  ingredient_id: string
  employee_id: string
  type: MovementType
  quantity: string
  reason: string
  reference_id?: string | null
  notes?: string | null
}

export interface RecountInput {
  ingredient_id: string
  employee_id: string
  counted_quantity: string
  reason?: string
  notes?: string | null
}

// --- Stock ---------------------------------------------------------------------------------
export async function listStock(branchId: string): Promise<Stock[]> {
  return (await http.get<Stock[]>(`/inventory/branches/${branchId}/stock`)).data
}

export async function listLowStock(branchId: string): Promise<Stock[]> {
  return (await http.get<Stock[]>(`/inventory/branches/${branchId}/stock/low`)).data
}

export async function getStock(branchId: string, ingredientId: string): Promise<Stock> {
  return (await http.get<Stock>(`/inventory/branches/${branchId}/stock/${ingredientId}`)).data
}

export async function setThreshold(branchId: string, input: SetThresholdInput): Promise<Stock> {
  return (await http.put<Stock>(`/inventory/branches/${branchId}/stock/threshold`, input)).data
}

// --- Movements -----------------------------------------------------------------------------
export async function registerMovement(
  branchId: string,
  input: RegisterMovementInput,
): Promise<Movement> {
  return (await http.post<Movement>(`/inventory/branches/${branchId}/movements`, input)).data
}

export async function recount(branchId: string, input: RecountInput): Promise<Movement> {
  return (await http.post<Movement>(`/inventory/branches/${branchId}/recounts`, input)).data
}

export async function listMovements(branchId: string, ingredientId: string): Promise<Movement[]> {
  return (await http.get<Movement[]>(`/inventory/branches/${branchId}/movements/${ingredientId}`))
    .data
}
