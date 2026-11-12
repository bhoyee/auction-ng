// Collection deadlines are a window ("collect on any working day up to…"),
// so every surface prints the same Lagos date and a 12-hour time.
const zone = 'Africa/Lagos';

function parts(dueAt: Date | string, options: Intl.DateTimeFormatOptions) {
  const values: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    ...options,
  }).formatToParts(new Date(dueAt)))
    values[part.type] = part.value;
  return values;
}

/** "5:00pm" */
function time(dueAt: Date | string) {
  const p = parts(dueAt, { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${p.hour}:${p.minute}${(p.dayPeriod ?? '').toLowerCase()}`;
}

/**
 * long: "Friday, 13 November 2026, 5:00pm WAT"
 * short: "13 Nov 2026, 5:00pm WAT"
 */
export function formatCollectionDeadline(
  dueAt: Date | string,
  style: 'long' | 'short' = 'long',
): string {
  const p =
    style === 'long'
      ? parts(dueAt, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : parts(dueAt, { day: 'numeric', month: 'short', year: 'numeric' });
  const date =
    style === 'long'
      ? `${p.weekday}, ${p.day} ${p.month} ${p.year}`
      : `${p.day} ${p.month} ${p.year}`;
  return `${date}, ${time(dueAt)} WAT`;
}
