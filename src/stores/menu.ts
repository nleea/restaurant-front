import { defineStore } from 'pinia'
import * as api from '@/services/menu.api'
import type { Addon, Category, CategoryInput, Product, ProductInput } from '@/services/menu.api'

interface MenuState {
  categories: Category[]
  products: Product[]
  addons: Addon[]
  // Active-branch price per product id, for the carta canvas. `null` = no price set yet.
  // The backend has no bulk price endpoint, so this is filled by loadPrices() in parallel.
  priceByProductId: Record<string, string | null>
  pricesLoaded: boolean
}

// Mirrors the RBAC store discipline: each mutation writes through the API then refetches the
// affected list — no hand-maintained cache. Active/category filtering is done client-side via
// getters over the full lists (a menu is small), so toggles are instant and need no refetch.
export const useMenuStore = defineStore('menu', {
  state: (): MenuState => ({
    categories: [],
    products: [],
    addons: [],
    priceByProductId: {},
    pricesLoaded: false,
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
