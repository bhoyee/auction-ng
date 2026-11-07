'use client';
import { useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, ChartNoAxesCombined, Table2 } from 'lucide-react';
import { formatNaira, type StaffDashboard } from '@auction-ng/shared';
import { Button } from '../web/button';

export function PaidSalesChart({ sales }: { sales: StaffDashboard['sales'] }) {
  const [table, setTable] = useState(false);
  function download() {
    const csv = [
      'Date (WAT),Paid orders,Paid sales (kobo)',
      ...sales.map((row) =>
        [row.day, row.count, row.amountKobo]
          .map((value) => '"' + String(value).replaceAll('"', '""') + '"')
          .join(','),
      ),
    ].join('\r\n');
    const href = URL.createObjectURL(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = href;
    link.download = 'lotvanta-paid-sales.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  return (
    <>
      <div className="lv-overview-chart-tools">
        <Button
          variant="ghost"
          aria-pressed={table}
          onClick={() => setTable((value) => !value)}
        >
          {table ? <ChartNoAxesCombined size={16} /> : <Table2 size={16} />}
          {table ? 'View chart' : 'View as table'}
        </Button>
        <Button variant="ghost" onClick={download} disabled={!sales.length}>
          <Download size={16} />
          Export CSV
        </Button>
      </div>
      {!sales.length ? (
        <div className="lv-overview-empty">
          <ChartNoAxesCombined size={28} />
          <strong>No paid sales in this period</strong>
          <p>
            Confirmed orders will appear here. Wallet deposits are not sales.
          </p>
        </div>
      ) : table ? (
        <div className="lv-staff-table-wrap">
          <table className="lv-staff-table">
            <caption>Recorded paid sales by day, WAT</caption>
            <thead>
              <tr>
                <th>Date (WAT)</th>
                <th>Orders</th>
                <th>Paid sales</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((row) => (
                <tr key={row.day}>
                  <td>{row.day}</td>
                  <td>{row.count}</td>
                  <td>{formatNaira(row.amountKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="lv-overview-sales-chart"
          role="img"
          aria-label="Paid sales trend. Use View as table for exact daily totals."
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart
              data={sales}
              margin={{ top: 16, right: 16, bottom: 8, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid vertical={false} stroke="var(--color-line)" />
              <XAxis
                dataKey="day"
                tickFormatter={(day: string) => day.slice(5)}
                tickLine={false}
                axisLine={false}
                minTickGap={36}
              />
              <YAxis
                width={76}
                tickFormatter={(value: number) =>
                  '₦' +
                  Intl.NumberFormat('en-NG', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(value / 100)
                }
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value) =>
                  typeof value === 'number' ? formatNaira(value) : 'Unavailable'
                }
                labelFormatter={(day) => String(day) + ' · WAT'}
              />
              <Line
                type="linear"
                dataKey="amountKobo"
                name="Paid sales"
                stroke="var(--color-indigo-700)"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
