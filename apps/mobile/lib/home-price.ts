export function homePrice(
  startPriceKobo: number,
  live: { status: string; lot: { currentPriceKobo: number | null } | null },
) {
  if (live.status !== 'live' || !live.lot) return undefined;
  return live.lot.currentPriceKobo ?? startPriceKobo;
}
