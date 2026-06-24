// Typed Menu API layer over the foundation's Axios instance. Reads require `menu.read`,
// writes `menu.manage` (enforced server-side). The tenant rides on the Host subdomain.
// Money values are decimal strings end-to-end — never coerce to number in transit.
import { http } from '@/lib/http'

export interface Category {
  id: string
  name: string
  position: number
  is_active: boolean
  parent_category_id: string | null
}

export interface Product {
  id: string
  category_id: string
  name: string
  description: string | null
  image_url: string | null
  is_active: boolean
}

export interface ProductPrice {
  id: string
  product_id: string
  branch_id: string
  price: string
  is_active: boolean
}

export interface Addon {
  id: string
  name: string
  price: string
  is_active: boolean
}

export interface CategoryInput {
  name: string
  parent_category_id?: string | null
  position?: number
}

export interface ProductInput {
  category_id: string
  name: string
  description?: string | null
  image_url?: string | null
}

// --- Categories ----------------------------------------------------------------------------
export async function listCategories(): Promise<Category[]> {
  return (await http.get<Category[]>('/menu/categories')).data
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  return (await http.post<Category>('/menu/categories', input)).data
}

export async function updateCategory(
  id: string,
  patch: Partial<Category>,
): Promise<Category> {
  return (await http.patch<Category>(`/menu/categories/${id}`, patch)).data
}

export async function deleteCategory(id: string): Promise<void> {
  await http.delete(`/menu/categories/${id}`)
}

// --- Products ------------------------------------------------------------------------------
export async function listProducts(): Promise<Product[]> {
  return (await http.get<Product[]>('/menu/products')).data
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return (await http.post<Product>('/menu/products', input)).data
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, 'id'>>,
): Promise<Product> {
  return (await http.patch<Product>(`/menu/products/${id}`, patch)).data
}

export async function deleteProduct(id: string): Promise<void> {
  await http.delete(`/menu/products/${id}`)
}

// --- Prices (per branch) -------------------------------------------------------------------
export async function listProductPrices(productId: string): Promise<ProductPrice[]> {
  return (await http.get<ProductPrice[]>(`/menu/products/${productId}/prices`)).data
}

export async function setProductPrice(
  productId: string,
  branchId: string,
  price: string,
  isActive = true,
): Promise<ProductPrice> {
  return (
    await http.put<ProductPrice>(`/menu/products/${productId}/prices/${branchId}`, {
      price,
      is_active: isActive,
    })
  ).data
}

// --- Addons & product<->addon --------------------------------------------------------------
export async function listAddons(): Promise<Addon[]> {
  return (await http.get<Addon[]>('/menu/addons')).data
}

export async function createAddon(
  name: string,
  price: string,
  isActive = true,
): Promise<Addon> {
  return (await http.post<Addon>('/menu/addons', { name, price, is_active: isActive })).data
}

export async function updateAddon(id: string, patch: Partial<Omit<Addon, 'id'>>): Promise<Addon> {
  return (await http.patch<Addon>(`/menu/addons/${id}`, patch)).data
}

export async function deleteAddon(id: string): Promise<void> {
  await http.delete(`/menu/addons/${id}`)
}

export async function listProductAddons(productId: string): Promise<Addon[]> {
  return (await http.get<Addon[]>(`/menu/products/${productId}/addons`)).data
}

export async function attachAddon(productId: string, addonId: string): Promise<void> {
  await http.post(`/menu/products/${productId}/addons/${addonId}`)
}

export async function detachAddon(productId: string, addonId: string): Promise<void> {
  await http.delete(`/menu/products/${productId}/addons/${addonId}`)
}
