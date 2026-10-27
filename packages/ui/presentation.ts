/** Presentation only: callers supply authoritative server time and amounts. */
export function countdown(
  endsAt: number,
  now: number,
  { showSeconds = false }: { showSeconds?: boolean } = {},
) {
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const text =
    seconds === 0
      ? 'Ended'
      : showSeconds
        ? `${hours >= 24 ? `${Math.floor(hours / 24)}d ` : ''}${hours > 0 ? `${hours % 24}h ` : ''}${minutes.toString().padStart(2, '0')}m ${remainder.toString().padStart(2, '0')}s`
        : hours > 0
          ? `${hours}h ${minutes}m`
          : seconds < 120
            ? `${minutes}m ${remainder.toString().padStart(2, '0')}s`
            : `${minutes}m left`;
  return {
    text,
    urgent: seconds > 0 && seconds < 600,
    label:
      seconds === 0
        ? 'Auction ended'
        : `${hours ? `${hours} hours ` : ''}${minutes} minutes ${remainder} seconds left`,
  };
}

export function parseNairaInput(value: string): number | undefined {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return undefined;
  const [whole = '', fraction = ''] = value.split('.');
  const kobo = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(kobo) && kobo >= 0 ? kobo : undefined;
}
