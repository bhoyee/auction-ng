import * as s from '@auction-ng/shared';
// Called only by the existing private worker; credentials never enter browser code.
export async function refreshOverviewAggregates(
  baseUrl: string,
  token: string,
  history: boolean,
) {
  const origin = new URL(baseUrl);
  if (
    origin.protocol !== 'http:' ||
    !['api', 'localhost', '127.0.0.1'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    token.length < 32
  )
    throw Error('Use a private analytics maintenance origin/token.');
  const response = await fetch(new URL('/internal/analytics/refresh', origin), {
    method: 'POST',
    redirect: 'error',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(s.overviewRefreshSchema.parse({ history })),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error('Analytics refresh will retry.');
  return s.overviewRefreshReportSchema.parse(await response.json());
}
