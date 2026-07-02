// KDS mock seed — dev/tests only; production adapts real tickets (see adapter.ts). Eight orders
// off a realistic Colombian menu, built relative to a passed-in `now` so the "getting cold"
// alerts and heat are live the instant the board loads. Deterministic on purpose (no random) so
// the demo always shows the same instructive states: one CRITICAL + late, one URGENT, two WARN,
// one READY, one just-fired PENDING.

import type {
  ComponentStatus,
  KdsComponent,
  KdsItem,
  KdsOrder,
  Recipe,
  Station,
  StationMeta,
} from './types'

const MIN = 60_000

// The prototype's fixed six-station relay — now confined to the mock world. Production station
// meta is derived from the branch's DB stations in lib/kds/stations.ts.
export const MOCK_STATIONS: StationMeta[] = [
  { id: 'GRILL', tag: 'GR', label: 'Parrilla', waitMin: 6 },
  { id: 'FRYER', tag: 'FR', label: 'Fritura', waitMin: 3 },
  { id: 'COLD', tag: 'CO', label: 'Fríos', waitMin: 5 },
  { id: 'BAR', tag: 'BA', label: 'Bar', waitMin: 4 },
  { id: 'ASSEMBLY', tag: 'AS', label: 'Montaje', waitMin: 2 },
  { id: 'DESSERTS', tag: 'DE', label: 'Postres', waitMin: 8 },
]

const WAIT_MIN: Record<string, number> = Object.fromEntries(
  MOCK_STATIONS.map((m) => [m.id, m.waitMin]),
)

let seq = 0
function comp(
  name: string,
  station: Station,
  status: ComponentStatus,
  doneMinAgo: number | null,
  now: number,
  tasks: string[] = [],
): KdsComponent {
  return {
    id: `c${++seq}`,
    name,
    station,
    status,
    tasks,
    doneAt: status === 'done' ? now - (doneMinAgo ?? 0) * MIN : null,
    waitMin: WAIT_MIN[station] ?? 5,
  }
}

// One recipe per dish — enough to make the drawer feel real without a backend.
const RECIPES: Record<string, Recipe> = {
  'Hamburguesa clásica': {
    photoLabel: 'Hamburguesa clásica',
    ingredients: ['180 g carne de res', '1 pan brioche', 'Lechuga y tomate', 'Papas a la francesa'],
    allergens: ['gluten', 'dairy'],
    steps: ['Sellar la carne 3 min por lado', 'Tostar el pan', 'Montar con vegetales', 'Freír las papas'],
  },
  'Bandeja Paisa': {
    photoLabel: 'Bandeja Paisa',
    ingredients: ['Frijoles', 'Chicharrón', 'Chorizo', 'Arroz', 'Aguacate', 'Huevo'],
    allergens: [],
    steps: ['Calentar frijoles', 'Freír chicharrón', 'Asar chorizo', 'Montar la bandeja', 'Freír huevo al final'],
  },
  Churrasco: {
    photoLabel: 'Churrasco',
    ingredients: ['300 g lomo', 'Chimichurri', 'Patacones', 'Ensalada fresca'],
    allergens: [],
    steps: ['Sellar la carne al punto', 'Preparar chimichurri', 'Freír patacones', 'Emplatar'],
  },
  'Sancocho de gallina': {
    photoLabel: 'Sancocho de gallina',
    ingredients: ['Caldo de gallina', 'Yuca', 'Papa', 'Plátano', 'Arroz'],
    allergens: [],
    steps: ['Hervir el caldo base', 'Agregar tubérculos', 'Cocer la gallina', 'Servir con arroz'],
  },
  'Empanadas x3': {
    photoLabel: 'Empanadas x3',
    ingredients: ['3 empanadas de maíz', 'Ají', 'Hogao'],
    allergens: [],
    steps: ['Freír a 180 °C', 'Escurrir', 'Servir con ají y hogao'],
  },
  'Limonada de coco': {
    photoLabel: 'Limonada de coco',
    ingredients: ['Zumo de limón', 'Crema de coco', 'Hielo'],
    allergens: ['dairy'],
    steps: ['Licuar limón y coco', 'Servir sobre hielo'],
  },
  'Brownie con helado': {
    photoLabel: 'Brownie con helado',
    ingredients: ['Brownie', 'Helado de vainilla', 'Salsa de chocolate'],
    allergens: ['gluten', 'dairy', 'nuts'],
    steps: ['Calentar el brownie', 'Servir la bola de helado', 'Bañar con salsa'],
  },
  'Arepas con queso': {
    photoLabel: 'Arepas con queso',
    ingredients: ['Arepas de maíz', 'Queso', 'Mantequilla'],
    allergens: ['dairy', 'vegan'],
    steps: ['Asar la arepa', 'Fundir el queso', 'Untar mantequilla'],
  },
}

function item(id: string, qty: number, name: string, modifiers: string[], components: KdsComponent[]): KdsItem {
  const recipe = RECIPES[name]
  if (!recipe) throw new Error(`seed: missing recipe for "${name}"`)
  return { id, qty, name, modifiers, components, recipe }
}

export function seedOrders(now: number): KdsOrder[] {
  seq = 0
  const c = (n: string, s: Station, st: ComponentStatus, ago: number | null = null, tasks: string[] = []) =>
    comp(n, s, st, ago, now, tasks)

  return [
    // 1 · T4 · CRITICAL + late — fries done 10 min ago (FRYER holds 3), plate stuck on grill/cold.
    {
      id: 'ORD230414',
      table: 'T4',
      guests: 4,
      type: 'dinein',
      waiter: 'Camila',
      startedAt: now - 37 * MIN,
      bumpedAt: null,
      items: [
        item('i1', 1, 'Hamburguesa clásica', ['extra mayo', 'sin cebolla'], [
          // Itemized station tasks (dev/demo of the read-only sub-lines on a component).
          c('Beef patty 180g', 'GRILL', 'cooking', null, ['Carne de hamburguesa', 'Tocineta ahumada']),
          c('Bun toasted', 'ASSEMBLY', 'done', 20),
          c('Lettuce & tomato', 'COLD', 'pending'),
          c('Papas fritas', 'FRYER', 'done', 10),
        ]),
      ],
    },
    // 2 · T7 · URGENT — chicharrón done 7 min ago (FRYER holds 3 → 2×), waiting on grill chorizo.
    {
      id: 'ORD230417',
      table: 'T7',
      guests: 6,
      type: 'dinein',
      waiter: 'Diego',
      startedAt: now - 22 * MIN,
      bumpedAt: null,
      items: [
        item('i2', 1, 'Bandeja Paisa', [], [
          c('Frijoles', 'GRILL', 'cooking'),
          c('Chicharrón', 'FRYER', 'done', 7),
          c('Chorizo a la brasa', 'GRILL', 'pending'),
          c('Arroz + aguacate', 'ASSEMBLY', 'pending'),
          c('Huevo frito', 'GRILL', 'cooking'),
        ]),
      ],
    },
    // 3 · T2 · WARN — empanadas done 4 min ago (FRYER 3 → 1×), waiting on the ají from Fríos.
    {
      id: 'ORD230422',
      table: 'T2',
      guests: 2,
      type: 'delivery',
      waiter: 'Paola',
      startedAt: now - 12 * MIN,
      bumpedAt: null,
      items: [
        item('i3', 1, 'Empanadas x3', [], [
          c('Empanadas fritas', 'FRYER', 'done', 4),
          c('Ají y hogao', 'COLD', 'pending'),
        ]),
        item('i4', 2, 'Limonada de coco', ['sin azúcar'], [
          c('Lemon juice blend', 'BAR', 'cooking'),
          c('Coconut cream', 'BAR', 'pending'),
        ]),
      ],
    },
    // 4 · T9 · IN PROGRESS, no alert — chimichurri just came up, still fresh under Fríos' 5 min.
    {
      id: 'ORD230431',
      table: 'T9',
      guests: 3,
      type: 'dinein',
      waiter: 'Andrés',
      startedAt: now - 8 * MIN,
      bumpedAt: null,
      items: [
        item('i5', 1, 'Churrasco', ['término medio'], [
          c('Corte de carne', 'GRILL', 'cooking'),
          c('Chimichurri', 'COLD', 'done', 1),
          c('Patacones', 'FRYER', 'pending'),
          c('Ensalada fresca', 'COLD', 'pending'),
        ]),
      ],
    },
    // 5 · T1 · READY — every component up. Sinks to the bottom, breathes the success halo.
    {
      id: 'ORD230405',
      table: 'T1',
      guests: 2,
      type: 'dinein',
      waiter: 'Camila',
      startedAt: now - 9 * MIN,
      bumpedAt: null,
      items: [
        item('i6', 2, 'Arepas con queso', [], [
          c('Arepas a la plancha', 'GRILL', 'done', 2),
          c('Queso derretido', 'ASSEMBLY', 'done', 1),
          c('Mantequilla', 'COLD', 'done', 1),
        ]),
      ],
    },
    // 6 · T11 · PENDING — just fired, nothing started. Takeout.
    {
      id: 'ORD230440',
      table: 'T11',
      guests: 1,
      type: 'takeout',
      waiter: 'Diego',
      startedAt: now - 5 * MIN,
      bumpedAt: null,
      items: [
        item('i7', 1, 'Brownie con helado', ['nueces aparte'], [
          c('Brownie caliente', 'DESSERTS', 'pending'),
          c('Bola de helado', 'COLD', 'pending'),
          c('Salsa de chocolate', 'DESSERTS', 'pending'),
        ]),
      ],
    },
    // 7 · T5 · IN PROGRESS — gallina done 3 min ago but Parrilla holds 6, so no alert yet.
    {
      id: 'ORD230428',
      table: 'T5',
      guests: 5,
      type: 'delivery',
      waiter: 'Paola',
      startedAt: now - 15 * MIN,
      bumpedAt: null,
      items: [
        item('i8', 1, 'Sancocho de gallina', [], [
          c('Caldo base', 'GRILL', 'cooking'),
          c('Yuca + papa + plátano', 'GRILL', 'cooking'),
          c('Gallina troceada', 'GRILL', 'done', 3),
          c('Arroz acompañante', 'ASSEMBLY', 'pending'),
        ]),
      ],
    },
    // 8 · T8 · WARN (second alert) — patty done 8 min ago (Parrilla 6 → 1×), waiting on the fryer.
    {
      id: 'ORD230419',
      table: 'T8',
      guests: 3,
      type: 'dinein',
      waiter: 'Andrés',
      startedAt: now - 18 * MIN,
      bumpedAt: null,
      items: [
        item('i9', 1, 'Hamburguesa clásica', ['doble carne'], [
          c('Beef patty 180g', 'GRILL', 'done', 8),
          c('Bun toasted', 'ASSEMBLY', 'done', 5),
          c('Lettuce & tomato', 'COLD', 'cooking'),
          c('Papas fritas', 'FRYER', 'pending'),
        ]),
        item('i10', 1, 'Limonada de coco', [], [
          c('Lemon juice blend', 'BAR', 'done', 2),
          c('Coconut cream', 'BAR', 'cooking'),
        ]),
      ],
    },
  ]
}
