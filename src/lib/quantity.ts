// Format a decimal-string (or number) physical quantity for display. Unlike money, stock can be
// fractional (1.5 kg) so we never round to integers — we only trim insignificant trailing zeros
// ("8.000" → "8", "1.500" → "1.5") and optionally append a unit abbreviation. Returns '' for
// empty/invalid input so callers can show their own empty state.
export function formatQuantity(
  value: string | number | null | undefined,
  unitAbbr?: string,
): string {
  if (value === null || value === undefined || value === '') return ''
  const n = typeof value === 'string' ? Number(value) : value
  if (Number.isNaN(n)) return ''
  // Trim trailing zeros and a dangling decimal point without scientific notation.
  const text = n.toFixed(3).replace(/\.?0+$/, '')
  return unitAbbr ? `${text} ${unitAbbr}` : text
}
