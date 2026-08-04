// Recipes API layer (frontend slice): the ingredient directory the Inventory board needs
// (list + create/update for the "Nuevo insumo" flow, gated by `recipes.write`), plus the
// aggregated per-variant recipe card the KDS drawer renders. Reads require `recipes.read`.
// The full recipes/BOM CRUD is owned elsewhere.
import { http } from '@/lib/http'

export interface Ingredient {
  id: string
  name: string
  category: string | null
  unit_of_measure_id: string
  is_active: boolean
  /** Whether a customer may exclude this ingredient from a dish. Staples (salt, oil) are false. */
  is_customer_removable: boolean
  /**
   * Kitchen station where this insumo is worked. Optional — an insumo without one is fully
   * usable, it just contributes nothing to the station suggestion the kitchen derives from a
   * recipe. Never read when routing an order.
   */
  default_station_id: string | null
}

export interface CreateIngredientInput {
  name: string
  category?: string | null
  unit_of_measure_id: string
  is_customer_removable?: boolean
  default_station_id?: string | null
}

export interface UpdateIngredientInput {
  name?: string
  category?: string | null
  unit_of_measure_id?: string
  is_active?: boolean
  is_customer_removable?: boolean
  /** Send an explicit `null` to clear it; omit the key to leave it untouched. */
  default_station_id?: string | null
}

export async function listIngredients(active?: boolean): Promise<Ingredient[]> {
  const params = active === undefined ? undefined : { active: String(active) }
  return (await http.get<Ingredient[]>('/recipes/ingredients', { params })).data
}

export async function createIngredient(input: CreateIngredientInput): Promise<Ingredient> {
  return (await http.post<Ingredient>('/recipes/ingredients', input)).data
}

export async function updateIngredient(
  ingredientId: string,
  patch: UpdateIngredientInput,
): Promise<Ingredient> {
  return (await http.patch<Ingredient>(`/recipes/ingredients/${ingredientId}`, patch)).data
}

// --- Ingredient unit costs (for the live food-cost meter) ----------------------
// Per-ingredient unit cost = moving-average of purchase prices. `unit_cost` is null when the
// ingredient has no purchase history (cost unavailable — never zeroed, so the meter can show an
// honest partial state instead of a fabricated 100% margin). Decimal serialized as a string.
export interface IngredientCost {
  ingredient_id: string
  unit_cost: string | null
}

export async function listIngredientCosts(): Promise<IngredientCost[]> {
  return (await http.get<IngredientCost[]>('/recipes/ingredient-costs')).data
}

// --- Recipe items (BOM per variant) --------------------------------------------
// The variant's bill of materials: which ingredient (and how much) one sale deducts from stock.
// The response carries only ids + a decimal-string quantity — the ingredient name and unit label
// are resolved against `listIngredients()` / the catalog units by callers (no denormalized labels).
export interface RecipeItem {
  id: string
  product_variant_id: string
  ingredient_id: string
  /** Decimal serialized by the API as a string (e.g. "150.000"). Never coerce in transit. */
  quantity: string
  unit_of_measure_id: string
  /**
   * Where THIS insumo is worked in THIS dish. Overrides the ingredient's default station:
   * rice is boiled in one plate and fried in another, and this line is the (dish, ingredient)
   * pair where that question has an answer. Null falls back to the ingredient's default.
   */
  station_id: string | null
}

export interface RecipeItemInput {
  ingredient_id: string
  /** Positive decimal string. */
  quantity: string
  unit_of_measure_id: string
  station_id?: string | null
}

export async function listRecipeItems(variantId: string): Promise<RecipeItem[]> {
  return (await http.get<RecipeItem[]>(`/recipes/variants/${variantId}/items`)).data
}

export async function addRecipeItem(
  variantId: string,
  input: RecipeItemInput,
): Promise<RecipeItem> {
  return (await http.post<RecipeItem>(`/recipes/variants/${variantId}/items`, input)).data
}

export async function updateRecipeItem(
  itemId: string,
  patch: Partial<Pick<RecipeItemInput, 'quantity' | 'unit_of_measure_id' | 'station_id'>>,
): Promise<RecipeItem> {
  return (await http.patch<RecipeItem>(`/recipes/items/${itemId}`, patch)).data
}

// 204 on success. May 422 ("Desactiva la variante antes de quitar su última receta.") when it is
// the last item of an active variant — surface that detail to the user.
export async function deleteRecipeItem(itemId: string): Promise<void> {
  await http.delete(`/recipes/items/${itemId}`)
}

// Active variants with no recipe: legacy SKUs that sell without deducting stock, so they can be
// found and fixed. The name is nullable (a plain variant carries the product's name).
export interface VariantMissingRecipe {
  product_variant_id: string
  variant_name: string | null
  product_name: string
}

export async function listVariantsMissingRecipe(): Promise<VariantMissingRecipe[]> {
  return (await http.get<VariantMissingRecipe[]>('/recipes/variants/missing-recipe')).data
}

// --- Recipe card (KDS drawer) --------------------------------------------------
export const ALLERGEN_KEYS = ['gluten', 'dairy', 'nuts', 'shellfish', 'vegan'] as const
export type AllergenKey = (typeof ALLERGEN_KEYS)[number]

export interface RecipeCardIngredient {
  name: string
  /** Decimal serialized by the API as a string (e.g. "180.000"). */
  quantity: string
  unit: string
}

export interface RecipeCard {
  product_variant_id: string
  ingredients: RecipeCardIngredient[]
  steps: string[]
  allergens: AllergenKey[]
  photo_label: string | null
}

/** 404s when the variant has neither BOM nor details — callers render "sin receta", not an error. */
export async function getRecipeCard(variantId: string): Promise<RecipeCard> {
  return (await http.get<RecipeCard>(`/recipes/variants/${variantId}/card`)).data
}
