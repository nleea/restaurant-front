// Permission modules ARE restaurant stations. We show a Spanish station name in headers
// (kitchen vernacular) while the English permission code stays on each action. Display only —
// the code identifiers remain English per project convention. Unmapped modules fall back to a
// title-cased version of the raw module, so new backend modules never break the UI.
const STATION_LABELS: Record<string, string> = {
  cash: 'Caja',
  kitchen: 'Cocina',
  delivery: 'Despacho',
  inventory: 'Inventario',
  menu: 'Carta',
  catalog: 'Catálogo',
  orders: 'Pedidos',
  customers: 'Clientes',
  finance: 'Finanzas',
  purchasing: 'Compras',
  recipes: 'Recetas',
  staff: 'Personal',
  reports: 'Reportes',
  audit: 'Auditoría',
  messaging: 'Mensajería',
  rbac: 'Accesos',
  identity: 'Identidad',
}

export function stationLabel(module: string): string {
  return STATION_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1)
}
