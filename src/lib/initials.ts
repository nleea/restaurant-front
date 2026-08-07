// Avatar initials. Employee labels come from the RBAC directory as a display name, and fall
// back to an email when the person has no name yet — both have to yield something legible.

/** "Ana Restrepo" → "AR"; "carla@demo.com" → "CA"; "ana.lopez@demo.com" → "AL"; "—" → "?". */
export function initialsOf(label: string): string {
  const cleaned = label.trim()
  if (!cleaned || cleaned === '—') return '?'

  // An email is not a name: the domain says nothing about the person, so drop it. Otherwise
  // every address at the same tenant would collapse to the same second letter.
  const at = cleaned.indexOf('@')
  const base = at > 0 ? cleaned.slice(0, at) : cleaned

  const words = base
    .split(/[\s._-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)

  const [first, second] = words
  if (!first) return '?'
  if (second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase()
  return first.slice(0, 2).toUpperCase()
}
