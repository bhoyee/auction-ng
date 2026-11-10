// Illustrative "example win" slides for the home hero. Owner-requested
// marketing content (2026-11-10): every name, place, date and price here is
// made up and the slides are labelled "Example" on the page. They never use
// customer data and carry no verified mark.
//
// The set is reshuffled once per Lagos calendar day, so visitors see different
// names, places, items and prices over time instead of the same five slides.

export type ExampleWin = {
  id: string;
  firstName: string;
  place: string;
  dateIso: string;
  category: string;
  title: string;
  image: string;
  retailKobo: number;
  winningKobo: number;
};

const firstNames = [
  'Chinedu',
  'Aisha',
  'Tunde',
  'Ngozi',
  'Emeka',
  'Fatima',
  'Bola',
  'Ifeoma',
  'Musa',
  'Kemi',
  'Segun',
  'Halima',
  'Uche',
  'Zainab',
  'Femi',
  'Amaka',
  'Ibrahim',
  'Funmi',
  'Obinna',
  'Hauwa',
  'Dayo',
  'Nneka',
  'Yusuf',
  'Tobi',
  'Chioma',
  'Sani',
  'Adaeze',
  'Kunle',
  'Blessing',
  'Ahmed',
];

// Short place codes as the owner specified (states and major cities).
const places = [
  'LA',
  'ABJ',
  'IB',
  'KD',
  'PH',
  'KN',
  'EN',
  'BN',
  'JOS',
  'OW',
  'AB',
  'IL',
];

// Gadget line-up with owner-approved prices (2026-11-10), in Naira: a fixed
// retail price shown crossed out, and the range a winning bid is drawn from.
// Images are transparent cut-outs in apps/web/public/wins/<slug>.(webp|png);
// items without an image are left out of the rotation.
export const exampleWinItems = [
  {
    slug: 'iphone-14',
    category: 'Phones',
    title: 'iPhone 14, 128 GB',
    retail: 500000,
    win: [150000, 220000],
  },
  {
    slug: 'iphone-13',
    category: 'Phones',
    title: 'iPhone 13, 128 GB',
    retail: 420000,
    win: [120000, 180000],
  },
  {
    slug: 'smartwatch',
    category: 'Wearables',
    title: 'Smartwatch',
    retail: 180000,
    win: [45000, 80000],
  },
  {
    slug: 'smart-speaker',
    category: 'Smart home',
    title: 'Smart speaker',
    retail: 120000,
    win: [30000, 55000],
  },
  {
    slug: 'robot-vacuum',
    category: 'Home appliances',
    title: 'Robot vacuum cleaner',
    retail: 350000,
    win: [90000, 150000],
  },
  {
    slug: 'headset',
    category: 'Audio',
    title: 'Wireless headset',
    retail: 150000,
    win: [35000, 65000],
  },
  {
    slug: 'earbuds',
    category: 'Audio',
    title: 'Wireless earbuds',
    retail: 130000,
    win: [30000, 55000],
  },
  {
    slug: 'tablet',
    category: 'Tablets',
    title: '11-inch tablet',
    retail: 450000,
    win: [120000, 200000],
  },
  {
    slug: 'laptop',
    category: 'Computers',
    title: '14-inch laptop',
    retail: 850000,
    win: [250000, 380000],
  },
  {
    slug: 'bluetooth-speaker',
    category: 'Audio',
    title: 'Bluetooth speaker',
    retail: 95000,
    win: [25000, 45000],
  },
] as const;
export type ExampleWinSlug = (typeof exampleWinItems)[number]['slug'];

// Small deterministic PRNG so server and client agree for a given day.
function generator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lagosDay = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

const roundTo = (value: number, step: number) =>
  Math.max(step, Math.round(value / step) * step);

// images maps each available item to its picture; at most count slides, one
// per item, so the slider shrinks while gadget images are still missing.
export function exampleWins(
  images: Partial<Record<ExampleWinSlug, string>>,
  now = new Date(),
  count = 5,
): ExampleWin[] {
  const items = exampleWinItems.filter((item) => images[item.slug]);
  const day = lagosDay(now);
  let seed = 0;
  for (const char of day)
    seed = Math.imul(seed ^ char.charCodeAt(0), 2654435761);
  const random = generator(seed);
  const pick = <T>(list: readonly T[], used: Set<T>) => {
    let value = list[Math.floor(random() * list.length)] as T;
    for (let tries = 0; used.has(value) && tries < list.length; tries++)
      value = list[Math.floor(random() * list.length)] as T;
    used.add(value);
    return value;
  };
  const names = new Set<string>();
  const products = new Set<(typeof items)[number]>();
  const wins: ExampleWin[] = [];
  for (let index = 0; index < Math.min(count, items.length); index++) {
    const item = pick(items, products);
    const [low, high] = item.win;
    const retailNaira = item.retail;
    const winningNaira = Math.min(
      roundTo(low + random() * (high - low), 500),
      high,
    );
    const daysAgo = 1 + Math.floor(random() * 12);
    wins.push({
      id: `${day}-${index}`,
      firstName: pick(firstNames, names),
      place: places[Math.floor(random() * places.length)] ?? 'LA',
      dateIso: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
      category: item.category,
      title: item.title,
      image: images[item.slug] ?? '',
      retailKobo: retailNaira * 100,
      winningKobo: winningNaira * 100,
    });
  }
  return wins.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
}
