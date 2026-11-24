'use client';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { formatNaira } from '@auction-ng/shared/money';

type Point = { day: string; dayNumber: number; cumulativeKobo: number };

/** Money back by day since received, against what the batch cost. */
export function RecoveryChart({
  points,
  costKobo,
  breakEvenDay,
  money,
  day,
}: {
  points: Point[];
  costKobo: number;
  breakEvenDay: number | null;
  money: (kobo: number) => string;
  day: (value: string) => string;
}) {
  const last = points.at(-1);
  const crossing = points.find((p) => p.dayNumber === breakEvenDay);
  // One day of data still draws a line.
  const rows = points.length === 1 && last ? [last, last] : points;
  return (
    <>
      <div className="lv-batch-legend" aria-hidden="true">
        <span data-line="back">Money back</span>
        <span data-line="cost">Batch cost</span>
      </div>
      <div
        className="lv-batch-chart"
        role="img"
        aria-label={`Money back over ${points.length} days: ${money(last?.cumulativeKobo ?? 0)} against a cost of ${money(costKobo)}. ${crossing ? `Cost recovered on day ${breakEvenDay}.` : 'Cost not recovered yet.'}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 24, right: 56, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis
              dataKey="dayNumber"
              type="number"
              domain={[0, Math.max(1, last?.dayNumber ?? 1)]}
              tickFormatter={(v: number) => `Day ${v}`}
              allowDecimals={false}
              minTickGap={48}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={74}
              domain={[0, Math.max(costKobo, last?.cumulativeKobo ?? 0) * 1.15]}
              tickFormatter={(v: number) => money(Math.round(v))}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({
                active,
                payload,
              }: TooltipContentProps<number, string>) => {
                const point = payload?.[0]?.payload as Point | undefined;
                if (!active || !point) return null;
                return (
                  <div className="lv-admin-chart-tooltip">
                    <strong>
                      Day {point.dayNumber} · {day(point.day)}
                    </strong>
                    <span>Money back {formatNaira(point.cumulativeKobo)}</span>
                    <span>Batch cost {formatNaira(costKobo)}</span>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={costKobo}
              stroke="var(--color-chart-previous)"
              strokeDasharray="5 4"
              strokeWidth={2}
            />
            <Line
              type="linear"
              dataKey="cumulativeKobo"
              name="Money back"
              stroke="var(--color-chart-indigo)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            {last && (
              <ReferenceDot
                x={last.dayNumber}
                y={last.cumulativeKobo}
                r={0}
                label={{
                  value: money(last.cumulativeKobo),
                  position: 'top',
                  className: 'lv-batch-chart-label',
                }}
              />
            )}
            {crossing && (
              <ReferenceDot
                x={crossing.dayNumber}
                y={crossing.cumulativeKobo}
                r={5}
                fill="var(--color-win-600)"
                stroke="var(--color-surface)"
                strokeWidth={2}
                label={{
                  value: `Break-even · day ${breakEvenDay}`,
                  position: 'top',
                  className: 'lv-batch-chart-label',
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
