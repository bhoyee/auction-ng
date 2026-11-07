import { formatNaira } from './money';

// Analytics can be negative after fee refunds; payment inputs remain non-negative.
export function formatMetricMoney(value: number): string {
  if (!Number.isSafeInteger(value))
    throw new RangeError('Unsafe metric amount');
  return (value < 0 ? '−' : '') + formatNaira(Math.abs(value));
}
export const overviewMetrics = {
  netRevenue: {
    label: 'Net revenue',
    definition:
      'Service charges, lot fees, storage fees and delivery margin, excluding VAT, minus refunds of those fees.',
    format: 'money',
    good: 'up',
  },
  gmv: {
    label: 'GMV (hammer total)',
    definition:
      'Hammer prices of lots sold at auction in the period, by closing time. Excludes VAT and fees.',
    format: 'money',
    good: 'up',
  },
  lotsSold: {
    label: 'Lots sold',
    definition: 'Lots closed with a winning bid in the selected period.',
    format: 'count',
    good: 'up',
  },
  sellThrough: {
    label: 'Sell-through',
    definition: 'Lots sold divided by lots closed in the selected period.',
    format: 'percent',
    good: 'up',
  },
  activeBidders: {
    label: 'Active bidders',
    definition:
      'Distinct buyers who placed at least one accepted bid in the selected period.',
    format: 'count',
    good: 'up',
  },
  pickupBacklog: {
    label: 'Pickup backlog',
    definition:
      'Paid lots not yet collected, at the latest snapshot. This is a current count.',
    format: 'count',
    good: 'down',
  },
} as const;
export type OverviewMetric = keyof typeof overviewMetrics;
export function metricChange(current: number, previous: number | null) {
  return previous === null || previous === 0
    ? null
    : ((current - previous) / Math.abs(previous)) * 100;
}
export function deltaIsGood(metric: OverviewMetric, delta: number) {
  return overviewMetrics[metric].good === 'up' ? delta >= 0 : delta <= 0;
}
