import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStaffAdminClient } from '../packages/api-client/src/staff-admin';
import { ApiError } from '../packages/api-client/src/auth';
import { runBulkJobs, type BulkJob } from '../apps/admin/app/live-bulk-runner';

const job = (id: string): BulkJob => ({
  reference: id,
  payload: {
    operation: 'extend',
    lotId: id,
    idempotencyKey: id,
    expectedRevision: '1-0',
    reason: 'Service interruption',
    extensionMs: 120000,
  },
  state: 'ready',
  message: 'Ready',
});
afterEach(() => vi.unstubAllGlobals());
describe('live monitor bulk jobs', () => {
  it('keeps the typed pending/completed receipt instead of inferring completion from HTTP 200', async () => {
    const key = '10000000-0000-4000-8000-000000000001';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: key,
            status: 'pending',
            message: 'Processing safely',
          }),
          { status: 200 },
        ),
      ),
    );
    const client = createStaffAdminClient('http://localhost:4000', {
      accessToken: 'test',
      deviceId: 'fixture',
    });
    expect(
      (
        await client.controlLiveLot({
          ...job(key).payload,
          operation: 'extend',
        })
      ).status,
    ).toBe('pending');
  });
  it('continues after a rejected lot and never repeats completed jobs', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409))
      .mockResolvedValue({ status: 'completed', message: 'Extended' });
    const jobs = [job('one'), job('two')];
    const results = await runBulkJobs(
      jobs,
      send,
      () => {},
      () => {},
    );
    expect(results.map((row) => row.state)).toEqual(['rejected', 'completed']);
    await runBulkJobs(
      results,
      send,
      () => {},
      () => {},
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
  it('retries uncertain and pending requests with exactly the same payload and key', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce({ status: 'pending', message: 'Processing' })
      .mockResolvedValueOnce({ status: 'completed', message: 'Extended' });
    const original = job('same-key');
    let result = await runBulkJobs(
      [original],
      send,
      () => {},
      () => {},
    );
    expect(result[0]?.state).toBe('uncertain');
    result = await runBulkJobs(
      result,
      send,
      () => {},
      () => {},
    );
    expect(result[0]?.state).toBe('pending');
    result = await runBulkJobs(
      result,
      send,
      () => {},
      () => {},
    );
    expect(result[0]?.state).toBe('completed');
    for (const [payload] of send.mock.calls)
      expect(payload).toBe(original.payload);
  });
  it('stops on an expired staff session without submitting the remaining jobs', async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(401));
    const expired = vi.fn();
    const result = await runBulkJobs(
      [job('one'), job('two')],
      send,
      () => {},
      expired,
    );
    expect(expired).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(result[1]?.state).toBe('ready');
  });
});
