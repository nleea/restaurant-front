// Friendly labels for the cash-movement concepts written by cross-module integrations: order
// sales, supplier payments (purchasing), and fiado settlements (customers). Manually-registered
// movements carry a free-text concept the user typed, which passes through unchanged.
const CONCEPT_LABELS: Record<string, string> = {
  sale: 'Venta',
  purchase_payment: 'Pago a proveedor',
  credit_payment: 'Abono fiado',
}

export function conceptLabel(concept: string): string {
  return CONCEPT_LABELS[concept] ?? concept
}
