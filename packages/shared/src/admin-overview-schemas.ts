import { z } from 'zod';
export const overviewWidgets = [
  'kpis',
  'revenue',
  'live',
  'categories',
  'funnel',
  'attention',
  'top-lots',
  'activity',
  'stock-age',
  'monthly-finance',
] as const;
export const overviewWidgetSchema = z.enum(overviewWidgets);
export function overviewPointCount(q: {
  from: string;
  to: string;
  grain: 'day' | 'week' | 'month';
}) {
  const days =
    Math.round((Date.parse(q.to) - Date.parse(q.from)) / 86400000) + 1;
  if (!Number.isFinite(days)) return Infinity;
  if (q.grain === 'month')
    return (
      (Number(q.to.slice(0, 4)) - Number(q.from.slice(0, 4))) * 12 +
      Number(q.to.slice(5, 7)) -
      Number(q.from.slice(5, 7)) +
      1
    );
  if (q.grain === 'week')
    return Math.ceil(
      (days + ((new Date(q.from + 'T00:00:00Z').getUTCDay() + 6) % 7)) / 7,
    );
  return days;
}
export const overviewWidgetPermissions = {
  kpis: 'finance.read',
  revenue: 'finance.read',
  live: 'auctions.manage',
  categories: 'finance.read',
  funnel: 'finance.read',
  attention: 'dashboard.view',
  'top-lots': 'finance.read',
  activity: 'audit.read',
  'stock-age': 'inventory.read',
  'monthly-finance': 'finance.read',
} as const;
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'Enter a valid date',
  );
export const overviewQuerySchema = z
  .object({
    from: day,
    to: day,
    compare: z.enum(['prev', 'none', 'year']).default('prev'),
    grain: z.enum(['day', 'week', 'month']).default('day'),
  })
  .strict()
  .refine((q) => q.from <= q.to, 'The date range is reversed')
  .refine(
    (q) => (Date.parse(q.to) - Date.parse(q.from)) / 86400000 <= 36600,
    'Choose a range of at most 100 years',
  )
  .refine(
    (q) => overviewPointCount(q) <= 400,
    'Choose a coarser chart grain or a shorter range',
  );
const integer = z.number().int().safe();
const row = z
  .object({
    label: z.string().max(240),
    value: integer,
    previous: integer.nullable().optional(),
    detail: z.string().max(300).optional(),
    reference: z.string().max(80).optional(),
    secondary: integer.optional(),
    tone: z.enum(['info', 'warning', 'danger', 'success']).optional(),
    destination: z
      .enum([
        'inventory',
        'auctions',
        'pickup',
        'finance',
        'support',
        'buyers',
        'audit',
      ])
      .optional(),
  })
  .strict();
export const overviewDataSchema = z
  .object({
    rows: z.array(row).max(50).default([]),
    series: z
      .array(
        z
          .object({
            day: z.string().max(40),
            value: integer,
            previous: integer.nullable(),
            extra: integer.optional(),
          })
          .strict(),
      )
      .max(400)
      .default([]),
    kpis: z
      .array(
        z
          .object({
            id: z.enum([
              'netRevenue',
              'gmv',
              'lotsSold',
              'sellThrough',
              'activeBidders',
              'pickupBacklog',
            ]),
            value: integer,
            previous: integer.nullable(),
            sparkline: z.array(integer).max(32),
          })
          .strict(),
      )
      .max(6)
      .default([]),
  })
  .strict();
export const overviewResponseSchema = z
  .object({
    widget: overviewWidgetSchema,
    mode: z.enum(['demo', 'aggregate', 'unavailable']),
    updatedAt: z.iso.datetime(),
    message: z.string().optional(),
    data: overviewDataSchema.optional(),
  })
  .strict()
  .refine(
    (v) => (v.mode === 'unavailable' ? !v.data : !!v.data),
    'Data must match its source status',
  );
export type OverviewWidget = z.infer<typeof overviewWidgetSchema>;
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type OverviewData = z.infer<typeof overviewDataSchema>;
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;

// WAT has no daylight-saving transitions. Date controls operate on dates, not the device timezone.
export function watDay(now = new Date()) {
  return new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
}
export function shiftDay(value: string, amount: number) {
  return new Date(Date.parse(value + 'T00:00:00Z') + amount * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function overviewRange(
  preset: string,
  now = new Date(),
): { from: string; to: string } {
  const to = watDay(now);
  const from =
    preset === 'today'
      ? to
      : preset === '7'
        ? shiftDay(to, -6)
        : preset === 'month'
          ? to.slice(0, 7) + '-01'
          : preset === 'year'
            ? to.slice(0, 4) + '-01-01'
            : preset === 'all'
              ? '2020-01-01'
              : shiftDay(to, -29);
  return { from, to };
}
export function comparisonRange(query: OverviewQuery) {
  if (query.compare === 'none') return null;
  if (query.compare === 'year') {
    const before = (day: string) => {
      const date = new Date(day + 'T00:00:00Z');
      const month = date.getUTCMonth();
      date.setUTCFullYear(date.getUTCFullYear() - 1);
      if (date.getUTCMonth() !== month) date.setUTCDate(0);
      return date.toISOString().slice(0, 10);
    };
    return { from: before(query.from), to: before(query.to) };
  }
  const days =
    Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86400000) + 1;
  return { from: shiftDay(query.from, -days), to: shiftDay(query.from, -1) };
}
