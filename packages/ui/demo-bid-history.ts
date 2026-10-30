// Presentation-only fixtures: never accepted bids, prices, holds or account records.
export const demoBidHistory = Array.from({ length: 23 }, (_, index) => ({
  id: `demo-history-${index + 1}`,
  bidder: `Demo bidder ${(index % 5) + 1}`,
  amountKobo: 1500000 - index * 50000,
  createdAt: new Date(
    Date.UTC(2026, 9, 28, 12, 0) - index * 180000,
  ).toISOString(),
}));
