// Colombian peso formatting shared across the Finanzas charts.
// Full form uses dots as thousands separators: $1.250.000 (no decimals).
export function cop(n: number): string {
  return '$' + Math.round(Math.abs(n)).toLocaleString('es-CO', { maximumFractionDigits: 0 })
}

// Signed: negatives in accountant parentheses → ($5.000).
export function copSigned(n: number): string {
  return n < 0 ? `(${cop(n)})` : cop(n)
}

// Abbreviated for chart axes: $1.2M, $980K, $420.
export function copShort(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) {
    const v = n / 1_000_000
    return '$' + (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + 'M'
  }
  if (a >= 1_000) return '$' + Math.round(n / 1_000) + 'K'
  return '$' + Math.round(n)
}

export function pct(n: number): string {
  return `${n.toFixed(1)}%`
}
