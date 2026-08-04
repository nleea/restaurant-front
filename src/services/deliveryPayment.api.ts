// El enlace de pago de un domicilio ya cotizado. Todo lo que la pantalla pinta viene del
// servidor: el cliente está mirando una cifra que va a pagar, y una que el navegador sumara por
// su cuenta puede discrepar de la que el restaurante va a cobrar.
import { http } from '@/lib/http'

export interface DeliveryPaymentLine {
  name: string
  quantity: number
  line_subtotal: string
}

export interface DeliveryPaymentRequest {
  order_id: string
  order_code: string
  lines: DeliveryPaymentLine[]
  subtotal: string
  discount: string
  delivery_fee: string
  total: string
  /** Lo que falta por pagar AHORA. Es la cifra que se declara — nunca `delivery_fee`. */
  amount_due: string
  quote_distance_km: string
  status: string
  expires_at: string
  address_text?: string | null
  payment_method?: string | null
}

const base = (token: string) => `/delivery/payment-requests/${encodeURIComponent(token)}`

export async function getDeliveryPaymentRequest(token: string): Promise<DeliveryPaymentRequest> {
  return (await http.get<DeliveryPaymentRequest>(base(token))).data
}

export async function selectDeliveryPaymentMethod(
  token: string,
  paymentMethod: string,
): Promise<void> {
  await http.post(`${base(token)}/method`, { payment_method: paymentMethod })
}

export async function declareDeliveryPayment(
  token: string,
  amount: number,
  method: string,
): Promise<{ claim_id: string; status: string; amount: string }> {
  return (await http.post(`${base(token)}/claim`, { amount, method })).data
}

export async function uploadDeliveryPaymentProof(
  token: string,
  amount: number,
  file: File,
): Promise<{ claim_id: string; status: string; amount: string }> {
  const form = new FormData()
  form.append('amount', String(amount))
  form.append('file', file)
  return (await http.post(`${base(token)}/proof`, form)).data
}
