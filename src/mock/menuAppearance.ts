// Mock "published" appearance config the panel boots from, so the admin never starts on a blank
// canvas. When the API lands, replace this with a GET and keep the shape identical.
import {
  DEFAULT_DISH_CARD,
  DEFAULT_DISH_DETAIL,
  type MenuAppearanceConfig,
} from '@/lib/menuAppearance'

export const mockPublishedConfig: MenuAppearanceConfig = {
  theme: {
    primaryColor: '#b5432b',
    secondaryColor: '#e08a2b',
    backgroundColor: '#faf5ee',
    textColor: '#2c2521',
    accentColor: '#2f7d52',
    fontFamily: 'Playfair Display',
  },
  brand: {
    logoUrl: '',
    bannerUrl: '',
    restaurantName: 'La Cevichería del Cabo',
  },
  // Default layout on a 4-column grid: banner spans the top (large 2×2), featured + search share
  // the next band, the full menu sits below, footer closes it out. The four presentation blocks
  // (promo/hours/gallery/testimonials) start hidden in the tray for the admin to place.
  blocks: [
    { id: 'banner', visible: true, position: { x: 0, y: 0 }, size: 'large' },
    { id: 'featured_categories', visible: true, position: { x: 2, y: 0 }, size: 'medium' },
    { id: 'search', visible: true, position: { x: 2, y: 1 }, size: 'medium' },
    { id: 'full_menu', visible: true, position: { x: 0, y: 2 }, size: 'large' },
    { id: 'footer', visible: true, position: { x: 2, y: 2 }, size: 'medium' },
    { id: 'promo', visible: false, position: { x: 0, y: 0 }, size: 'medium' },
    { id: 'hours', visible: false, position: { x: 0, y: 0 }, size: 'small' },
    { id: 'gallery', visible: false, position: { x: 0, y: 0 }, size: 'large' },
    { id: 'testimonials', visible: false, position: { x: 0, y: 0 }, size: 'medium' },
  ],
  // Presentation defaults; the admin tunes these from the "Plato" tab.
  dishCard: { ...DEFAULT_DISH_CARD, show: { ...DEFAULT_DISH_CARD.show } },
  dishDetail: { sections: DEFAULT_DISH_DETAIL.sections.map((s) => ({ ...s })) },
  // Admin-authored content for the new blocks.
  blockContent: {
    promo: {
      title: 'Plato del día',
      body: 'Cazuela de mariscos con arroz de coco — solo hoy.',
      imageUrl: '',
    },
    hours: {
      rows: [
        { label: 'Lun–Jue', value: '11:00 – 21:00' },
        { label: 'Vie–Sáb', value: '11:00 – 23:00' },
        { label: 'Dom', value: '11:00 – 18:00' },
      ],
    },
    testimonials: {
      items: [
        { author: 'María P.', quote: 'El mejor ceviche de Riohacha, sin discusión.' },
        { author: 'Andrés G.', quote: 'Porciones generosas y todo bien fresco.' },
      ],
    },
    gallery: { imageUrls: [] },
  },
}
