import { ApiError } from '@auction-ng/api-client/auth';
import type { LotControlInput, MonitorCommand } from '@auction-ng/shared';

export type BulkPayload =
  LotControlInput | (MonitorCommand & { operation: 'message' });
export type BulkJob = {
  reference: string;
  payload: BulkPayload;
  state:
    'ready' | 'running' | 'completed' | 'pending' | 'uncertain' | 'rejected';
  message: string;
};
export type BulkReceipt = { status: 'pending' | 'completed'; message: string };
/** A retry must reuse the frozen request; successful or rejected lots are never resubmitted. */
export async function runBulkJobs(
  jobs: readonly BulkJob[],
  send: (payload: BulkPayload) => Promise<BulkReceipt>,
  onUpdate: (jobs: BulkJob[]) => void,
  onUnauthorized: () => void,
) {
  const next = jobs.map((job) => ({ ...job }));
  for (const job of next) {
    if (['completed', 'rejected'].includes(job.state)) continue;
    job.state = 'running';
    job.message = 'Submitting request';
    onUpdate(next.map((row) => ({ ...row })));
    try {
      const receipt = await send(job.payload);
      job.state = receipt.status;
      job.message = receipt.message;
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : null;
      const rejected =
        status !== null && [400, 403, 404, 409, 422].includes(status);
      job.state = rejected ? 'rejected' : 'uncertain';
      job.message = rejected
        ? 'Not applied: the item changed, closed, or your permission no longer allows this action. Review it before starting a new request.'
        : 'Result not confirmed. Retry this same request to check safely.';
      if (status === 401) {
        onUpdate(next.map((row) => ({ ...row })));
        onUnauthorized();
        return next;
      }
    }
    onUpdate(next.map((row) => ({ ...row })));
  }
  return next;
}
