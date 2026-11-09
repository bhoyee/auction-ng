export class InvalidMoneyError extends RangeError {}

export function assertKobo(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new InvalidMoneyError('Kobo must be a non-negative safe integer.');
}

export function toLedgerKobo(value: number): bigint {
  assertKobo(value);
  return BigInt(value);
}

export function fromLedgerKobo(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new InvalidMoneyError('Kobo is outside the safe integer range.');
  return Number(value);
}

export function addKobo(...values: number[]): number {
  return fromLedgerKobo(
    values.reduce((sum, value) => sum + toLedgerKobo(value), 0n),
  );
}

export function formatNaira(value: number): string {
  const amount = toLedgerKobo(value);
  const whole = (amount / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const remainder = amount % 100n;
  return `₦${whole}${remainder === 0n ? '' : `.${remainder.toString().padStart(2, '0')}`}`;
}
