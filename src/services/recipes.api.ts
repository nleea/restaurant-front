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
}

export interface CreateIngredientInput {
  name: string
  category?: string | null
  unit_of_measure_id: string
}

export interface UpdateIngredientInput {
  name?: string
  category?: string | null
  unit_of_measure_id?: string
  is_active?: boolean
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
