// Appearance API layer: the persisted public-carta config. `GET` requires `menu.read`, `PUT`
// requires `menu.manage` (enforced server-side). The tenant rides on the Host subdomain. The wire
// shape IS the frontend `MenuAppearanceConfig` — the backend stores it as a JSONB document, so this
// is a thin pass-through with no field remapping.
import { http } from '@/lib/http'
import type { MenuAppearanceConfig } from '@/lib/menuAppearance'

// The tenant's saved config, or a backend-computed default when none has been saved yet (never 404).
export async function getAppearance(): Promise<MenuAppearanceConfig> {
  return (await http.get<MenuAppearanceConfig>('/menu/appearance')).data
}

// Upsert the whole config; the backend echoes the saved document back so the client can re-sync.
export async function putAppearance(config: MenuAppearanceConfig): Promise<MenuAppearanceConfig> {
  return (await http.put<MenuAppearanceConfig>('/menu/appearance', config)).data
}
