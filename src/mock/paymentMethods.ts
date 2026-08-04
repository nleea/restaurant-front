// Payment methods "configured by the admin" — a mock stand-in for what the admin will eventually
// toggle per tenant. The storefront renders whatever is here (never a hardcoded cash/transfer pair).
import type { PaymentMethod } from '@/lib/storefront'

export const mockPaymentMethods: PaymentMethod[] = [
  {
    id: 'cash',
    label: 'Efectivo',
    icon: 'pi-money-bill',
    needsProof: false,
    info: 'Pagas al recibir tu pedido. Ten el valor exacto si puedes.',
  },
  {
    id: 'transfer',
    label: 'Transferencia',
    icon: 'pi-qrcode',
    needsProof: true,
    info: 'Nequi / Bancolombia · 300 123 4567 — La Cevichería del Cabo S.A.S. Escanea el QR y adjunta tu comprobante.',
  },
  {
    id: 'card',
    label: 'Tarjeta',
    icon: 'pi-credit-card',
    needsProof: false,
    info: 'Datáfono al momento de la entrega o la recogida.',
  },
  {
    id: 'online',
    label: 'Pago en línea',
    icon: 'pi-globe',
    needsProof: false,
    info: 'Te llevaremos a la pasarela para pagar con tu método preferido.',
  },
]
