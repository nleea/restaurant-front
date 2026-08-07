// Mandar el comprobante del pago. Público: la credencial es el token del pedido, el mismo con el
// que se abre «mi pedido».
//
// Lo que esto NO hace: pagar. Lo que sube queda esperando a que una persona del restaurante mire
// que la plata llegó. Por eso la respuesta trae el pedido entero con su saldo intacto — un "ok" a
// secas se leería como "ya está pagado", y esa confusión se paga en la puerta.
import { http } from '@/lib/http'
import { detailOf } from '@/lib/apiError'
import type { MyOrder } from '@/services/myOrder.api'

/** Lo que el backend acepta. Un archivo más grande o de otro tipo se rechaza antes de guardarse. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024
export const PROOF_ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf'

export interface ProofResult {
  claimId: string
  status: string
  order: MyOrder
}

export class ProofUploadFailed extends Error {}

/**
 * Sube el comprobante de un pedido y devuelve el pedido releído.
 *
 * `amount` es lo que el cliente dice haber pagado. El MÉTODO no viaja: sale del pedido, para que
 * el cobro que se registre después no pueda contradecir al comprobante.
 */
export async function uploadPaymentProof(
  token: string,
  file: File,
  amount: number,
): Promise<ProofResult> {
  if (file.size > MAX_PROOF_BYTES) {
    throw new ProofUploadFailed('El archivo pesa demasiado (máximo 5 MB).')
  }
  const form = new FormData()
  form.append('file', file)
  form.append('amount', String(amount))
  try {
    const { data } = await http.post<ProofResult>(
      `/storefront/orders/${encodeURIComponent(token)}/payment-proof`,
      form,
    )
    return data
  } catch (error) {
    // Se cuenta lo que pasó y no se pinta como enviado: un comprobante que el cliente cree
    // mandado y no llegó es una discusión en la puerta.
    throw new ProofUploadFailed(
      detailOf(error) ?? 'No pudimos subir tu comprobante. Intenta de nuevo o mándalo por WhatsApp.',
    )
  }
}
