'use client';
import { Input } from '@auction-ng/ui/web/input';
import { Select } from '@auction-ng/ui/web/select';

export const wat = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso)) + ' WAT';
// <input type="datetime-local"> holds a wall-clock time; staff work in WAT.
const watInputValue = (date: Date) =>
  new Date(date.getTime() + 3_600_000).toISOString().slice(0, 16);
const fromWatInput = (value: string) =>
  new Date(`${value}:00+01:00`).toISOString();

export type Schedule = {
  when: 'now' | 'later';
  startsAt: string;
  hours: number;
};
export const newSchedule = (hours: number): Schedule => ({
  when: 'now',
  startsAt: watInputValue(new Date(Date.now() + 86_400_000)),
  hours,
});
/** false when the chosen date and time is empty. */
export const scheduleReady = (schedule: Schedule) =>
  schedule.when === 'now' || schedule.startsAt !== '';
/** null means start now. */
export const scheduleStart = (schedule: Schedule) =>
  schedule.when === 'now' ? null : fromWatInput(schedule.startsAt);
export const scheduleText = (schedule: Schedule) => {
  const start = scheduleStart(schedule);
  return start ? `Starts ${wat(start)}` : 'Goes live now';
};

const HOUR_CHOICES = [6, 12, 24, 48, 72, 168];
export const hoursText = (hours: number) =>
  hours % 24 === 0
    ? `${hours / 24} ${hours === 24 ? 'day' : 'days'}`
    : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;

/** When a relist starts and how long it runs. */
export function ScheduleFields({
  value,
  defaultHours,
  error,
  onChange,
}: {
  value: Schedule;
  defaultHours: number;
  error?: string;
  onChange: (value: Schedule) => void;
}) {
  const hourOptions = [...new Set([...HOUR_CHOICES, defaultHours])].sort(
    (a, b) => a - b,
  );
  return (
    <>
      <fieldset className="lv-relist-when">
        <legend>When should it start?</legend>
        {(
          [
            ['now', 'Start now'],
            ['later', 'Pick a date and time'],
          ] as const
        ).map(([when, label]) => (
          <label key={when}>
            <input
              type="radio"
              name="when"
              checked={value.when === when}
              onChange={() => onChange({ ...value, when })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {value.when === 'later' && (
        <Input
          label="Starts at (WAT)"
          type="datetime-local"
          value={value.startsAt}
          min={watInputValue(new Date())}
          onChange={(event) =>
            onChange({ ...value, startsAt: event.target.value })
          }
          error={error}
          required
        />
      )}
      <Select
        label="Runs for"
        value={String(value.hours)}
        onChange={(event) =>
          onChange({ ...value, hours: Number(event.target.value) })
        }
      >
        {hourOptions.map((hours) => (
          <option key={hours} value={hours}>
            {hoursText(hours)}
          </option>
        ))}
      </Select>
    </>
  );
}
