// Shared model + geometry for the public-menu appearance editor ("carta pública").
//
// English identifiers are binding here (project rule): the Spanish domain words live only in
// UI copy. Mapping used across this feature:
//   tema→theme · marca→brand · bloques→blocks · posicion→position · tamano→size
//   categorias_destacadas→featured_categories · buscador→search · carta_completa→full_menu
//
// This config is the contract the (separate) public storefront consumes; the admin only edits it.

export type BlockId =
  | 'banner'
  | 'featured_categories'
  | 'search'
  | 'full_menu'
  | 'footer'
  // Fase 1 · presentation additions
  | 'promo'
  | 'hours'
  | 'gallery'
  | 'testimonials'
export type BlockSize = 'small' | 'medium' | 'large'

export interface GridPosition {
  /** Column, 0-based. */
  x: number
  /** Row, 0-based (grows downward, unbounded). */
  y: number
}

export interface Block {
  id: BlockId
  visible: boolean
  position: GridPosition
  size: BlockSize
}

export interface ThemeConfig {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  textColor: string
  accentColor: string
  /** Family name from CURATED_FONTS. */
  fontFamily: string
}

export interface BrandConfig {
  /** Object URL / remote URL. Empty string = not set. */
  logoUrl: string
  bannerUrl: string
  restaurantName: string
  /**
   * QR de pago del negocio (Nequi/Bancolombia), subido en Perfil del negocio.
   *
   * Vive en la marca y no en un endpoint aparte porque la carta pública ya lee esta config:
   * el QR llega al checkout por el mismo camino que el logo, sin superficie nueva.
   */
  paymentQrUrl?: string
}

// --- Dish presentation (Fase 1) --------------------------------------------
// How every dish renders in the public carta — a single tenant-wide choice ("set it once, all
// dishes inherit"), never per-product. `style` picks the card shape; `show` toggles which fields
// of the real product appear. Data still comes from the menu store; this only styles it.
export type DishCardStyle = 'list' | 'card' | 'grid' | 'hero'

export interface DishCardConfig {
  style: DishCardStyle
  show: {
    image: boolean
    description: boolean
    price: boolean
    /** "+ adiciones" hint when the product has addons. */
    addonHint: boolean
    /** "personalizable" hint when the dish has removable ingredients. */
    removableHint: boolean
  }
}

// The dish-detail screen is a single vertical column, so its layout is an ORDERED list of
// toggleable sections (same spirit as `blocks`, minus the 2D grid). Array order is render order.
export type DishDetailSectionId =
  | 'photo'
  | 'description'
  | 'variants'
  | 'addons'
  | 'remove'
  | 'note'

export interface DishDetailSection {
  id: DishDetailSectionId
  visible: boolean
}

export interface DishDetailConfig {
  sections: DishDetailSection[]
}

// --- Editable block content (Fase 1) ---------------------------------------
// Admin-authored content for the new blocks, held in the config so it travels with draft/published.
// `gallery` sources its images from the real product photos at render time; `imageUrls` here are
// optional standalone additions.
export interface PromoContent {
  title: string
  body: string
  imageUrl: string
}
export interface HoursRow {
  label: string
  value: string
}
export interface Testimonial {
  author: string
  quote: string
}
export interface BlockContent {
  promo: PromoContent
  hours: { rows: HoursRow[] }
  testimonials: { items: Testimonial[] }
  gallery: { imageUrls: string[] }
}

export interface MenuAppearanceConfig {
  theme: ThemeConfig
  brand: BrandConfig
  blocks: Block[]
  dishCard: DishCardConfig
  dishDetail: DishDetailConfig
  blockContent: BlockContent
}

// --- Grid geometry ----------------------------------------------------------
// A fixed-cell grid (Apple-widgets style), NOT free pixel placement. Each block occupies a
// whole number of cells; drag snaps to the nearest free cell and blocks never overlap.
export const GRID_COLUMNS = 4

export const SIZE_CELLS: Record<BlockSize, { w: number; h: number }> = {
  small: { w: 1, h: 1 },
  medium: { w: 2, h: 1 },
  large: { w: 2, h: 2 },
}

/** Cycle order for the resize control: small → medium → large → small. */
export const SIZE_CYCLE: BlockSize[] = ['small', 'medium', 'large']

export interface BlockMeta {
  label: string
  icon: string
  /** One-line description shown on the widget + tray. */
  blurb: string
}

export const BLOCK_META: Record<BlockId, BlockMeta> = {
  banner: { label: 'Banner', icon: 'pi-image', blurb: 'Imagen de cabecera' },
  featured_categories: { label: 'Categorías destacadas', icon: 'pi-star', blurb: 'Atajos a categorías' },
  search: { label: 'Buscador', icon: 'pi-search', blurb: 'Búsqueda de platos' },
  full_menu: { label: 'Carta completa', icon: 'pi-list', blurb: 'Todos los platos por categoría' },
  footer: { label: 'Pie de página', icon: 'pi-hashtag', blurb: 'Horario, contacto y redes' },
  promo: { label: 'Promoción', icon: 'pi-megaphone', blurb: 'Anuncio o plato del día' },
  hours: { label: 'Horario', icon: 'pi-clock', blurb: 'Días y horas de atención' },
  gallery: { label: 'Galería', icon: 'pi-images', blurb: 'Fotos de tus platos' },
  testimonials: { label: 'Testimonios', icon: 'pi-comments', blurb: 'Reseñas de clientes' },
}

/** Canonical order — used for the hidden-blocks tray and defaults. */
export const BLOCK_ORDER: BlockId[] = [
  'banner',
  'featured_categories',
  'search',
  'full_menu',
  'footer',
  'promo',
  'hours',
  'gallery',
  'testimonials',
]

// --- Curated fonts ----------------------------------------------------------
// A short, deliberate list: modern sans for a clean look, warmer/serif options for a cozier
// restaurant feel. Loaded from Google Fonts on demand (preview-only; never touches app chrome).
export interface CuratedFont {
  name: string
  /** CSS font stack applied in the preview. */
  stack: string
  tone: 'Moderna' | 'Cálida' | 'Clásica'
}

export const CURATED_FONTS: CuratedFont[] = [
  { name: 'Inter', stack: "'Inter', sans-serif", tone: 'Moderna' },
  { name: 'Poppins', stack: "'Poppins', sans-serif", tone: 'Moderna' },
  { name: 'Montserrat', stack: "'Montserrat', sans-serif", tone: 'Moderna' },
  { name: 'Nunito', stack: "'Nunito', sans-serif", tone: 'Cálida' },
  { name: 'Lora', stack: "'Lora', serif", tone: 'Cálida' },
  { name: 'Playfair Display', stack: "'Playfair Display', serif", tone: 'Clásica' },
]

export function fontStack(name: string): string {
  return CURATED_FONTS.find((f) => f.name === name)?.stack ?? "'Inter', sans-serif"
}

// Inject a Google Fonts <link> once per family, so the live preview renders the real typeface.
// Idempotent; safe to call on every selection. No-op during SSR / when document is unavailable.
const loadedFonts = new Set<string>()
export function ensureFontLoaded(name: string): void {
  if (typeof document === 'undefined' || loadedFonts.has(name)) return
  loadedFonts.add(name)
  const family = name.replace(/ /g, '+')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`
  document.head.appendChild(link)
}

export const DEFAULT_THEME: ThemeConfig = {
  primaryColor: '#c0392b',
  secondaryColor: '#e67e22',
  backgroundColor: '#fbf7f0',
  textColor: '#2a2320',
  accentColor: '#1e8449',
  fontFamily: 'Poppins',
}

// --- Presentation defaults --------------------------------------------------
export const DEFAULT_DISH_CARD: DishCardConfig = {
  style: 'card',
  show: {
    image: true,
    description: true,
    price: true,
    addonHint: true,
    removableHint: false,
  },
}

/** Canonical detail order; the admin reorders/toggles from here. */
export const DEFAULT_DISH_DETAIL: DishDetailConfig = {
  sections: [
    { id: 'photo', visible: true },
    { id: 'description', visible: true },
    { id: 'variants', visible: true },
    { id: 'addons', visible: true },
    { id: 'remove', visible: true },
    { id: 'note', visible: true },
  ],
}

export const DISH_DETAIL_META: Record<DishDetailSectionId, { label: string; icon: string }> = {
  photo: { label: 'Foto', icon: 'pi-image' },
  description: { label: 'Descripción', icon: 'pi-align-left' },
  variants: { label: 'Variantes', icon: 'pi-sliders-h' },
  addons: { label: 'Adiciones', icon: 'pi-plus-circle' },
  remove: { label: 'Quitar ingredientes', icon: 'pi-minus-circle' },
  note: { label: 'Nota', icon: 'pi-pencil' },
}

// Derive the customer-facing removable-ingredient list from a variant's recipe (BOM). This is
// READ-ONLY: it never mutates the recipe — the returned names are display-only exclusion options.
// Deduped, order-preserving, empty when the variant has no recipe. `nameOf` resolves an
// ingredient id to its name (the menu store's `ingredientName`); unnamed/blank ids are dropped.
// `isRemovable` (optional) drops ingredients a customer must not exclude (staples like salt/oil,
// flagged `is_customer_removable = false`); when omitted, every named ingredient is removable.
export function removableIngredientsFor(
  recipeItems: { ingredient_id: string }[] | undefined,
  nameOf: (id: string) => string | undefined,
  isRemovable?: (id: string) => boolean,
): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const item of recipeItems ?? []) {
    if (isRemovable && !isRemovable(item.ingredient_id)) continue
    const name = nameOf(item.ingredient_id)?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

// --- Occupancy / collision --------------------------------------------------
/** The set of "x,y" cell keys a block covers. */
export function blockCells(block: Block): string[] {
  const { w, h } = SIZE_CELLS[block.size]
  const keys: string[] = []
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) keys.push(`${block.position.x + dx},${block.position.y + dy}`)
  }
  return keys
}

/** True if a block at `position`+`size` stays within the grid's column count. */
export function fitsInGrid(position: GridPosition, size: BlockSize): boolean {
  const { w } = SIZE_CELLS[size]
  return position.x >= 0 && position.y >= 0 && position.x + w <= GRID_COLUMNS
}

/**
 * True if a candidate placement would overlap any of `others`. `ignoreId` skips the block being
 * moved so it doesn't collide with its own current footprint.
 */
export function overlaps(
  candidate: { position: GridPosition; size: BlockSize; id: BlockId },
  others: Block[],
): boolean {
  const cells = new Set(
    blockCells({ ...candidate, visible: true } as Block),
  )
  return others.some(
    (b) => b.visible && b.id !== candidate.id && blockCells(b).some((c) => cells.has(c)),
  )
}

/** First free top-left cell (row-major scan) that fits `size` without overlap. */
export function findFreeCell(
  size: BlockSize,
  blocks: Block[],
  id: BlockId,
): GridPosition {
  const { w } = SIZE_CELLS[size]
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x + w <= GRID_COLUMNS; x++) {
      const position = { x, y }
      if (!overlaps({ position, size, id }, blocks)) return position
    }
  }
  return { x: 0, y: 0 }
}

/**
 * Reading order for the mobile public view. Desktop lays blocks on a 2D grid; a phone stacks them
 * in one column. Criterion: top-to-bottom, then left-to-right within the same row (y, then x).
 * The public storefront calls this to flatten the grid into a linear list.
 */
export function gridToLinearOrder(blocks: Block[]): Block[] {
  return blocks
    .filter((b) => b.visible)
    .slice()
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
}
