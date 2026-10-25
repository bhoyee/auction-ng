import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../apps/api/src/app';
import { getHealth } from '../packages/api-client/src/index';

describe('API health contract', () => {
  let app: Awaited<ReturnType<typeof createApi>>;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApi();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('returns the health response through the typed client', async () => {
    expect(await getHealth(baseUrl)).toEqual({ status: 'ok' });
  });
  it('documents health in OpenAPI', async () => {
    const response = await fetch(`${baseUrl}/docs-json`);
    const doc: unknown = await response.json();
    expect(doc).toMatchObject({
      paths: { '/health': { get: { responses: { '200': {} } } } },
    });
  });
  it('returns 404 for unimplemented routes', async () => {
    expect((await fetch(`${baseUrl}/not-implemented`)).status).toBe(404);
  });
});
