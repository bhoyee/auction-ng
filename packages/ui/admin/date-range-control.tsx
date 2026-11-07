'use client';
import { comparisonRange, type OverviewQuery } from '@auction-ng/shared';

export function DateRangeControl({
  value,
  preset,
  onPreset,
  onChange,
}: {
  value: OverviewQuery;
  preset: string;
  onPreset: (value: string) => void;
  onChange: (value: OverviewQuery) => void;
}) {
  const previous = comparisonRange(value);
  return (
    <div className="lv-admin-range-area">
      <div
        className="lv-admin-range-buttons"
        role="group"
        aria-label="Overview date range"
      >
        {[
          ['today', 'Today'],
          ['7', '7 days'],
          ['30', '30 days'],
          ['month', 'This month'],
          ['year', 'This year'],
          ['all', 'All time'],
          ['custom', 'Custom'],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={preset === id}
            onClick={() => onPreset(id ?? '30')}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="lv-admin-compare">
        <span>Compare:</span>
        <select
          aria-label="Comparison period"
          value={value.compare}
          onChange={(event) =>
            onChange({
              ...value,
              compare: event.target.value as OverviewQuery['compare'],
            })
          }
        >
          <option value="prev">previous period</option>
          <option value="year">same period last year</option>
          <option value="none">none</option>
        </select>
      </label>
      {preset === 'custom' && (
        <div className="lv-admin-custom-range">
          <label>
            From
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(event) =>
                event.target.value &&
                event.target.value <= value.to &&
                onChange({ ...value, from: event.target.value })
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(event) =>
                event.target.value &&
                event.target.value >= value.from &&
                onChange({ ...value, to: event.target.value })
              }
            />
          </label>
        </div>
      )}
      <span className="lv-admin-sr-only">
        {previous
          ? `Compared with ${previous.from} to ${previous.to}`
          : 'No comparison'}
      </span>
    </div>
  );
}
