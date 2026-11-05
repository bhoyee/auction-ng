import type { withdrawalStatusSchema } from '@auction-ng/shared';
type Status = ReturnType<typeof withdrawalStatusSchema.parse>;
type BadgeTone = 'neutral' | 'warning' | 'brand' | 'success' | 'danger';
const statuses: Record<Status, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Awaiting confirmation', tone: 'neutral' },
  review: { label: 'Under review', tone: 'warning' },
  queued: { label: 'Queued', tone: 'brand' },
  processing: { label: 'Processing', tone: 'brand' },
  pending: { label: 'Bank confirmation pending', tone: 'warning' },
  success: { label: 'Successful', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  reversed: { label: 'Reversed', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};
export function withdrawalBadge(status: Status, providerIssue = false) {
  return providerIssue
    ? { label: 'Provider action needed', tone: 'warning' as const }
    : statuses[status];
}
export function withdrawalConfirmationFeedback(status: Status) {
  const clearAmount = [
    'review',
    'queued',
    'processing',
    'pending',
    'success',
  ].includes(status);
  const tone =
    statuses[status].tone === 'danger'
      ? ('error' as const)
      : status === 'success'
        ? ('success' as const)
        : ('warning' as const);
  const message =
    status === 'success'
      ? 'Withdrawal successful. Your bank transfer is confirmed.'
      : status === 'review'
        ? 'Withdrawal submitted for review. We will update its status automatically.'
        : clearAmount
          ? 'Withdrawal submitted. Bank transfer confirmation will update automatically.'
          : `Withdrawal ${statuses[status].label.toLowerCase()}. Check withdrawal history before trying again.`;
  return { clearAmount, tone, message };
}
