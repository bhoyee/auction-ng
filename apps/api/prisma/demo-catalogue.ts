export function assertDemoDatabase(
  connection: string,
  mode: string | undefined,
) {
  const url = new URL(connection);
  if (
    mode === 'production' ||
    !['localhost', '127.0.0.1', 'postgres'].includes(url.hostname) ||
    !/^\/auction_ng_demo_[a-f0-9]{10,32}$/.test(url.pathname)
  )
    throw new Error(
      'Use a new local auction_ng_demo_* database; production and the main database are forbidden.',
    );
}
export function demoLotPlan(now: Date) {
  const prices = [
    1250000, 4500000, 18500000, 850000, 1550000, 1650000, 350000, 250000,
    2200000, 350000, 850000, 4500000,
  ];
  return Array.from({ length: 120 }, (_, index) => {
    const category = index % 12;
    const startPriceKobo =
      index === 0
        ? 250000
        : index === 119
          ? 85000000
          : (prices[category] ?? 250000) +
            Math.floor(index / 12) * (category === 2 ? 3500000 : 100000);
    return {
      category,
      startPriceKobo,
      retailPriceKobo: startPriceKobo * 3 + 1500000,
      startAt: new Date(now.getTime() - 3600000),
      endAt: new Date(
        now.getTime() +
          (index < 8 ? 8 + index : 16 + Math.floor(((index - 8) * 344) / 111)) *
            60000,
      ),
    };
  });
}
