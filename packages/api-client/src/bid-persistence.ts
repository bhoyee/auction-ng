import { persistBidsSchema, persistedBidsSchema } from '@auction-ng/shared';
export function createBidPersistenceClient(baseUrl: string, token: string) {
  const api = new URL(baseUrl);
  if (
    token.length < 32 ||
    api.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', 'api'].includes(api.hostname) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('Invalid private bid persistence configuration.');
  return async (streamIds: string[]) => {
    const response = await fetch(new URL('/internal/bids/persist', api), {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(persistBidsSchema.parse({ streamIds })),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error('Bid persistence failed; entries remain pending.');
    const receipt = persistedBidsSchema.parse(await response.json());
    if (
      receipt.persisted.length !== streamIds.length ||
      receipt.persisted.some((id, i) => id !== streamIds[i])
    )
      throw new Error('Bid persistence receipt does not match batch.');
    return receipt;
  };
}
