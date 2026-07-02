// KDS domain types. Identifiers in English (project convention); Spanish lives in UI copy only.
// A dish is decomposed into COMPONENTS, each owned by a station, and is Done only when all its
// components are Done. Today the real backend models one ticket per (order_item, station), so the
// adapter maps 1 ticket → 1 item with 1 component; the shape is ready for a future backend
// dish→component decomposition without UI changes (see lib/kds/adapter.ts).

/** A kitchen station id — a DB uuid in production, a short code in the mock seed/tests. */
export type Station = string

export type ComponentStatus = 'pending' | 'cooking' | 'done'

export type OrderType = 'dinein' | 'delivery' | 'takeout'

// Derived, never stored: computed from the components' statuses + timers.
export type OrderStatus = 'pending' | 'in_progress' | 'ready' | 'completed'
export type ItemStatus = 'pending' | 'cooking' | 'done'
export type Severity = 'none' | 'warn' | 'urgent' | 'critical'

export interface Allergen {
  key: 'gluten' | 'dairy' | 'nuts' | 'shellfish' | 'vegan'
  label: string
}

export interface Recipe {
  photoLabel: string
  ingredients: string[]
  allergens: Allergen['key'][]
  steps: string[]
}

export interface KdsComponent {
  id: string
  name: string
  station: Station
  status: ComponentStatus
  /**
   * Itemized task names this station owes the dish ("Carne", "Tocineta ahumada") — read-only
   * detail; status/timers stay per component. Empty when the mapping has none configured.
   */
  tasks: string[]
  /** ms timestamp when marked Done — drives the "getting cold" alert timing. */
  doneAt: number | null
  /**
   * Minutes this component can sit Done before the cold-alert clock starts. Carried on the
   * component (stamped from its station's meta at adapt/seed time) so the pure logic layer needs
   * no station registry.
   */
  waitMin: number
}

export interface KdsItem {
  id: string
  qty: number
  name: string
  modifiers: string[]
  components: KdsComponent[]
  /** Product variant behind the dish — lets the recipe drawer fetch the real recipe card. */
  variantId?: string | null
  /** Inline recipe content — mock/dev data only; production loads the card by `variantId`. */
  recipe?: Recipe
}

export interface KdsOrder {
  id: string // backend order uuid (or a mock ORD… ref)
  table: string // table number, '' when not dine-in / unknown
  guests: number // 0 when unknown (real tickets don't carry it)
  type: OrderType
  waiter: string // '' when unknown (real tickets don't carry it)
  /** ms timestamp the order was fired. */
  startedAt: number
  /** ms timestamp it was bumped/closed, else null. */
  bumpedAt: number | null
  items: KdsItem[]
}

// ── Station metadata ────────────────────────────────────────────────────────
// The two-letter tag is the cook's shorthand (what gets scrawled on a paper dupe). "waitMin" is
// how long a Done component of THIS station can sit before it's "getting cold" — fries die fast,
// desserts hold. Derived from the branch's DB stations (see lib/kds/stations.ts), never hardcoded.
export interface StationMeta {
  id: Station
  tag: string
  /** Rail label — the station's name as configured. */
  label: string
  /** minutes a Done component holds before the cold-alert clock starts. */
  waitMin: number
}

/** Target prep time for an order; drives the footer progress-bar heat and the late banner. */
export const ORDER_TARGET_MIN = 20
export const LATE_AFTER_MIN = 30

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 3,
  urgent: 2,
  warn: 1,
  none: 0,
}
