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

// Licensed demo photography (apps/web/public/demo/CREDITS.md). Ranges in Naira.
const items = [
  {
    category: 'Electronics',
    title: 'Wireless over-ear headphones',
    image: 'electronics',
    retail: [45000, 120000],
  },
  {
    category: 'Phones',
    title: 'Smartphone, 128 GB',
    image: 'phones',
    retail: [180000, 450000],
  },
  {
    category: 'Computers',
    title: '14-inch laptop',
    image: 'computers',
    retail: [350000, 900000],
  },
  {
    category: 'Appliances',
    title: 'Four-slice toaster',
    image: 'appliances',
    retail: [35000, 80000],
  },
  {
    category: 'Kitchen',
    title: 'Kitchen appliance set',
    image: 'kitchen',
    retail: [90000, 250000],
  },
  {
    category: 'Furniture',
    title: 'Wooden dining chair',
    image: 'furniture',
    retail: [40000, 110000],
  },
  {
    category: 'Fashion',
    title: "Men's sneakers",
    image: 'fashion',
    retail: [30000, 95000],
  },
  {
    category: 'Beauty',
    title: 'Skincare gift set',
    image: 'beauty',
    retail: [25000, 70000],
  },
  {
    category: 'Tools',
    title: 'Cordless drill kit',
    image: 'tools',
    retail: [55000, 160000],
  },
  {
    category: 'Baby and kids',
    title: 'Wooden learning blocks',
    image: 'children',
    retail: [15000, 45000],
  },
  {
    category: 'Sports',
    title: 'Adjustable dumbbell pair',
    image: 'sports',
    retail: [40000, 130000],
  },
  {
    category: 'Office',
    title: 'Office laptop',
    image: 'office',
    retail: [300000, 750000],
  },
] as const;

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

export function exampleWins(now = new Date(), count = 5): ExampleWin[] {
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
  for (let index = 0; index < count; index++) {
    const item = pick(items, products);
    const [low, high] = item.retail;
    const retailNaira = roundTo(low + random() * (high - low), 1000);
    // Winning bids land between 25% and 60% of the retail estimate.
    const winningNaira = roundTo(retailNaira * (0.25 + random() * 0.35), 500);
    const daysAgo = 1 + Math.floor(random() * 12);
    wins.push({
      id: `${day}-${index}`,
      firstName: pick(firstNames, names),
      place: places[Math.floor(random() * places.length)] ?? 'LA',
      dateIso: new Date(now.getTime() - daysAgo * 86400000).toISOString(),
      category: item.category,
      title: item.title,
      image: `/demo/${item.image}-thumb.webp`,
      retailKobo: retailNaira * 100,
      winningKobo: winningNaira * 100,
    });
  }
  return wins.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
}
