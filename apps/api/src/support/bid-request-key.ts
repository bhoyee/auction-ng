import { hashPii } from '../security/pii';
export function bidRequestKey(lotId: string) {
  const hex = hashPii(lotId, 'support-bid-cancellation');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
