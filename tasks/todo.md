# Carta pública + flujo de pedido (vista del cliente)

Ruta pública `/store` (sin auth, sin AppShell). Consume la config de tema (misma que edita
el panel de apariencia) vía CSS vars. Mobile-first. Firma: **comanda / tiquete térmico**.
Identificadores en inglés; copy en español. Todo mock.

## Plan
- [ ] `lib/storefront.ts` — tipos (Product, Addon, CartItem, Fulfillment, PaymentMethod, Address/Gps), lineTotal, constantes (DELIVERY_FEE, PICKUP_*)
- [ ] `mock/storefront.ts` — categorías + productos (foto/emoji, desc, precio, ingredientes removibles, addons) + addons
- [ ] `mock/paymentMethods.ts` — métodos configurados por el admin (efectivo, transferencia+QR, tarjeta, online)
- [ ] `stores/cart.ts` — items, fulfillment, dirección/gps, pago, totales, confirm()
- [ ] `components/storefront/Ticket.vue` — la firma (tiquete térmico perforado, reutilizado en carrito/resumen/confirmación)
- [ ] blocks/: BannerBlock, FeaturedCategoriesBlock, SearchBlock, FullMenuBlock, FooterBlock
- [ ] ProductCard.vue · ProductSheet.vue (detalle bottom-sheet: cantidad, addons, quitar ingredientes, nota)
- [ ] CartBar.vue (borde del tiquete asomando)
- [ ] FulfillmentStep.vue (recoger/domicilio · dirección manual · GPS) · PaymentStep.vue · SummaryStep.vue · ConfirmationStep.vue
- [ ] `views/StorefrontView.vue` — raíz de tema + máquina de pasos + bloques + sheet + cart bar
- [ ] router público `/store`
- [ ] verificar: type-check, lint, Vite transform, tests (cart totals, gridToLinearOrder)

Todos los ítems ✅ completados.

## Firma
Comanda térmica: el pedido se arma como un tiquete de restaurante (perforado, mono, tabular).
Navegar/detalle limpios y enfocados; el tiquete aparece en carrito → resumen → confirmación.
El color del tenant hace el oficio (primario=acciones, acento=precios). Respeta reduced-motion.

## Review
- Ruta pública `/store` (`meta.public`, sin auth, sin AppShell). Consume `mock/menuAppearance.ts`
  (misma config que edita el panel de apariencia) + `lib/menuAppearance.ts` (`gridToLinearOrder`,
  `fontStack`, `ensureFontLoaded`). Tema aplicado por CSS vars `--sf-*` en la raíz.
- Flujo completo: menú (bloques en orden lineal) → detalle (bottom-sheet: cantidad, addons, quitar
  ingredientes, nota) → carrito (tiquete editable) → entrega (recoger/domicilio · dirección/GPS con
  fallback) → pago (métodos mock, QR+comprobante) → resumen → confirmación (tiquete impreso + nº).
- Firma `OrderTicket.vue`: paper térmico con bordes festoneados (mask radial), mono tabular.
- Identificadores en inglés; copy en español. `crypto.randomUUID()` para uids.
- Verificado: type-check ✓ · lint ✓ · 6 tests carrito ✓ · Vite transforma 9 módulos ✓.
- Pendiente juicio visual en vivo: `demo.localhost:5173/store`. Deferido: fotos reales, conectar
  a la API/menu store real, animar transición entre pasos, drag no aplica aquí.
