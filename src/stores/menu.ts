import { defineStore } from 'pinia'
import * as api from '@/services/menu.api'
import * as recipesApi from '@/services/recipes.api'
import type {
  Addon,
  Category,
  CategoryInput,
  Product,
  ProductInput,
  ProductVariant,
  VariantInput,
} from '@/services/menu.api'
import type {
  CreateIngredientInput,
  Ingredient,
  RecipeItem,
  RecipeItemInput,
  VariantMissingRecipe,
} from '@/services/recipes.api'

interface MenuState {
  categories: Category[]
  products: Product[]
  addons: Addon[]
  // Ingredient directory (from recipes) — the recipe editor's insumo picker + name resolution.
  ingredients: Ingredient[]
  // Per-ingredient unit cost (moving-average of purchases). `null` = cost unavailable (no purchase
  // history) — never coerce to 0, so the food-cost meter shows an honest partial state. Keyed by id.
  unitCostByIngredientId: Record<string, number | null>
  costsLoaded: boolean
  // Active-branch price per product id, for the carta canvas. `null` = no price set yet.
  // The backend has no bulk price endpoint, so this is filled by loadPrices() in parallel.
  priceByProductId: Record<string, string | null>
  pricesLoaded: boolean
  // Sellable variants per product id, fetched on demand when a product is opened.
  variantsByProductId: Record<string, ProductVariant[]>
  // A variant's recipe (BOM) lines, keyed by variant id. Drives the recipe editor and the
  // "has a recipe?" gate on activation. Loaded per variant when a product is opened.
  recipeItemsByVariantId: Record<string, RecipeItem[]>
  // Active variants that sell without a recipe (a stock-guard leak), for the menu-wide banner.
  variantsMissingRecipe: VariantMissingRecipe[]
}

// Mirrors the RBAC store discipline: each mutation writes through the API then refetches the
// affected list — no hand-maintained cache. Active/category filtering is done client-side via
// getters over the full lists (a menu is small), so toggles are instant and need no refetch.
export const useMenuStore = defineStore('menu', {
  state: (): MenuState => ({
    categories: [],
    products: [],
    addons: [],
    ingredients: [],
    unitCostByIngredientId: {},
    costsLoaded: false,
    priceByProductId: {},
    pricesLoaded: false,
    variantsByProductId: {},
    recipeItemsByVariantId: {},
    variantsMissingRecipe: [],
  }),

  getters: {
    // Products grouped by category id, for the master list.
    productsByCategory: (state): Record<string, Product[]> => {
      const groups: Record<string, Product[]> = {}
      for (const p of state.products) {
        ;(groups[p.category_id] ??= []).push(p)
      }
      return groups
    },
    categoryName: (state) => (id: string): string | undefined =>
      state.categories.find((c) => c.id === id)?.name,
    // A variant is deductible (and therefore activatable) once it has at least one recipe line.
    // Returns false while items haven't been loaded yet — callers load them before gating.
    hasRecipe: (state) => (variantId: string): boolean =>
      (state.recipeItemsByVariantId[variantId]?.length ?? 0) > 0,

    ingredientName: (state) => (id: string): string | undefined =>
      state.ingredients.find((i) => i.id === id)?.name,

    // Whether a customer may exclude this ingredient from a dish. Staples (salt, oil) are flagged
    // false. Unknown ids default to true so a not-yet-loaded ingredient isn't silently hidden.
    isIngredientRemovable: (state) => (id: string): boolean =>
      state.ingredients.find((i) => i.id === id)?.is_customer_removable ?? true,

    // Unit cost of one ingredient (COP per unit), or null when unavailable (no purchase history).
    unitCostOf: (state) => (ingredientId: string): number | null =>
      state.unitCostByIngredientId[ingredientId] ?? null,

    // Roll the loaded BOM up to a variant's recipe cost. `partial` is true when at least one line's
    // ingredient has no cost yet — the meter then shows "sin costo" instead of a misleading margin.
    recipeCost: (state) => (variantId: string): { total: number; partial: boolean } => {
      const items = state.recipeItemsByVariantId[variantId] ?? []
      let total = 0
      let partial = false
      for (const it of items) {
        const cost = state.unitCostByIngredientId[it.ingredient_id]
        if (cost === null || cost === undefined) {
          partial = true
          continue
        }
        total += Number(it.quantity) * cost
      }
      return { total, partial }
    },
  },

  actions: {
    async fetchCategories(): Promise<void> {
      this.categories = await api.listCategories()
    },
    async fetchProducts(): Promise<void> {
      this.products = await api.listProducts()
    },
    async fetchAddons(): Promise<void> {
      this.addons = await api.listAddons()
    },

    // --- Ingredient directory + unit costs (for the recipe editor + food-cost meter) ---------
    async fetchIngredients(): Promise<void> {
      this.ingredients = await recipesApi.listIngredients()
    },
    // Load every ingredient's unit cost into the map. A null cost stays null (unavailable) — the
    // meter reads that as a partial state, never as free.
    async loadIngredientCosts(): Promise<void> {
      const rows = await recipesApi.listIngredientCosts()
      const map: Record<string, number | null> = {}
      for (const r of rows) {
        map[r.ingredient_id] = r.unit_cost === null ? null : Number(r.unit_cost)
      }
      this.unitCostByIngredientId = map
      this.costsLoaded = true
    },
    // Inline "Nuevo insumo" creation from the recipe editor; write-through refetch of the directory.
    // A brand-new ingredient has no purchases yet, so its cost is unavailable until one is recorded.
    async createIngredient(input: CreateIngredientInput): Promise<Ingredient> {
      const ingredient = await recipesApi.createIngredient(input)
      await this.fetchIngredients()
      return ingredient
    },

    async createCategory(input: CategoryInput): Promise<Category> {
      const cat = await api.createCategory(input)
      await this.fetchCategories()
      return cat
    },
    async updateCategory(id: string, patch: Partial<Category>): Promise<void> {
      await api.updateCategory(id, patch)
      await this.fetchCategories()
    },
    async deleteCategory(id: string): Promise<void> {
      await api.deleteCategory(id)
      await this.fetchCategories()
    },

    async createProduct(input: ProductInput): Promise<Product> {
      const prod = await api.createProduct(input)
      await this.fetchProducts()
      return prod
    },
    async updateProduct(id: string, patch: Partial<Omit<Product, 'id'>>): Promise<void> {
      await api.updateProduct(id, patch)
      await this.fetchProducts()
    },
    async deleteProduct(id: string): Promise<void> {
      await api.deleteProduct(id)
      await this.fetchProducts()
    },

    // Prices are read on demand per product (not held in store state).
    listPrices(productId: string) {
      return api.listProductPrices(productId)
    },
    async setPrice(productId: string, branchId: string, price: string, isActive = true) {
      const saved = await api.setProductPrice(productId, branchId, price, isActive)
      this.priceByProductId[productId] = saved.price
      return saved
    },

    // Load every loaded product's active-branch price in parallel into priceByProductId, so the
    // carta canvas can show prices without an N+1 waterfall. (A bulk endpoint would be better.)
    async loadPrices(branchId: string): Promise<void> {
      const entries = await Promise.all(
        this.products.map(async (p): Promise<[string, string | null]> => {
          try {
            const prices = await api.listProductPrices(p.id)
            return [p.id, prices.find((x) => x.branch_id === branchId)?.price ?? null]
          } catch {
            return [p.id, null]
          }
        }),
      )
      this.priceByProductId = Object.fromEntries(entries)
      this.pricesLoaded = true
    },

    async refreshPrice(productId: string, branchId: string): Promise<void> {
      try {
        const prices = await api.listProductPrices(productId)
        this.priceByProductId[productId] =
          prices.find((x) => x.branch_id === branchId)?.price ?? null
      } catch {
        // leave the cached value as-is on failure
      }
    },

    // --- Sellable variants (write-through refetch per product) ---------------
    async loadVariants(productId: string): Promise<void> {
      this.variantsByProductId[productId] = await api.listVariants(productId)
    },
    async addVariant(productId: string, input: VariantInput): Promise<ProductVariant> {
      const variant = await api.createVariant(productId, input)
      await this.loadVariants(productId)
      return variant
    },
    async renameVariant(productId: string, variantId: string, name: string): Promise<void> {
      await api.updateVariant(variantId, { name })
      await this.loadVariants(productId)
    },
    async removeVariant(productId: string, variantId: string): Promise<void> {
      await api.deleteVariant(variantId)
      await this.loadVariants(productId)
    },
    // Put a variant on / take it off sale. Guarded server-side: activating a variant with no recipe
    // is rejected (422) — the caller surfaces that. Write-through refetch of the product's variants.
    async setVariantActive(
      productId: string,
      variantId: string,
      isActive: boolean,
    ): Promise<void> {
      await api.updateVariant(variantId, { is_active: isActive })
      await this.loadVariants(productId)
    },

    // --- Recipe items / BOM (write-through refetch per variant) --------------
    async loadRecipeItems(variantId: string): Promise<void> {
      this.recipeItemsByVariantId[variantId] = await recipesApi.listRecipeItems(variantId)
    },
    // Load every variant's recipe in parallel, so the "sin receta" badges and the activation gate
    // are accurate across the whole list (not just the open editor).
    async loadRecipeItemsForVariants(variantIds: string[]): Promise<void> {
      await Promise.all(variantIds.map((id) => this.loadRecipeItems(id)))
    },
    async addRecipeItem(variantId: string, input: RecipeItemInput): Promise<RecipeItem> {
      const item = await recipesApi.addRecipeItem(variantId, input)
      await this.loadRecipeItems(variantId)
      return item
    },
    async updateRecipeItem(
      variantId: string,
      itemId: string,
      patch: Partial<Pick<RecipeItemInput, 'quantity' | 'unit_of_measure_id' | 'station_id'>>,
    ): Promise<void> {
      await recipesApi.updateRecipeItem(itemId, patch)
      await this.loadRecipeItems(variantId)
    },
    // May reject (422) when it's the last item of an active variant — the caller surfaces it.
    async removeRecipeItem(variantId: string, itemId: string): Promise<void> {
      await recipesApi.deleteRecipeItem(itemId)
      await this.loadRecipeItems(variantId)
    },

    // --- Missing-recipe read (active variants selling without deducting stock) ---
    async loadVariantsMissingRecipe(): Promise<void> {
      this.variantsMissingRecipe = await recipesApi.listVariantsMissingRecipe()
    },

    async createAddon(name: string, price: string, isActive = true): Promise<Addon> {
      const addon = await api.createAddon(name, price, isActive)
      await this.fetchAddons()
      return addon
    },
    async updateAddon(id: string, patch: Partial<Omit<Addon, 'id'>>): Promise<void> {
      await api.updateAddon(id, patch)
      await this.fetchAddons()
    },
    async deleteAddon(id: string): Promise<void> {
      await api.deleteAddon(id)
      await this.fetchAddons()
    },

    // Product<->addon associations are read on demand per product.
    listProductAddons(productId: string) {
      return api.listProductAddons(productId)
    },
    attachAddon(productId: string, addonId: string) {
      return api.attachAddon(productId, addonId)
    },
    detachAddon(productId: string, addonId: string) {
      return api.detachAddon(productId, addonId)
    },
  },
})
