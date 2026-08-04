// ─────────────────────────────────────────────────────────────────────────────
// Menu costing — the load-bearing figures behind the food-cost meter.
//
// Pure, framework-free number helpers ported from the Carta prototype (`lib/carta.ts`),
// now fed by real ingredient unit costs (moving-average of purchases) and the product's
// active-branch price. The meter is the one color-carrying signal — calm/warm/hot, reusing
// El Pase's heat-lamp language. When any ingredient cost is unavailable the recipe cost is
// "partial" and callers must show an honest "sin costo" state, never a fabricated margin.
// ─────────────────────────────────────────────────────────────────────────────

// The heat state of a dish's economics — calm / warm / hot.
export type CostHealth = 'good' | 'watch' | 'bad'

export function healthOf(pct: number): CostHealth {
  return pct < 25 ? 'good' : pct <= 35 ? 'watch' : 'bad'
}

export const HEALTH_COPY: Record<CostHealth, string> = {
  good: 'Excelente margen',
  watch: 'Margen aceptable',
  bad: 'Revisar precio o receta',
}

/** Food cost as a % of price. 0 when the price isn't set yet. */
export function foodCostPct(recipeCost: number, price: number): number {
  return price > 0 ? (recipeCost / price) * 100 : 0
}

/** Contribution margin in COP: price minus recipe cost. */
export function marginOf(recipeCost: number, price: number): number {
  return price - recipeCost
}

/** Quantity formatting: always 3 decimals so a formula reads like a spec sheet. */
export function qty(n: number): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

/** COP money, no decimals (Colombian pesos are whole-number in practice). */
export function money(n: number): string {
  return n.toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  })
}
