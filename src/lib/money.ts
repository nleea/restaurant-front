// Format a decimal-string (or number) amount as Colombian pesos for display only. Values stay
// strings everywhere else in transit; this is the single place that turns "23900.00" into
// "$ 23.900". Returns '' for empty/invalid input so callers can show their own empty state.
const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

export function formatCOP(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return ''
  return COP.format(n)
}
