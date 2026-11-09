import type { buyerNotificationPageSchema } from './buyer-schemas';
export type ForegroundMessage = ReturnType<
  typeof buyerNotificationPageSchema.parse
>['items'][number];
export const FOREGROUND_MESSAGE_POLL_MS = 5000;
export const FOREGROUND_MESSAGE_DISPLAY_MS = 12000;
export const foregroundMessageCopy = {
  title: 'Message from LotVanta',
  summary: 'There is an update about an item you bid on.',
  action: 'Read message',
} as const;

/** One tracker per signed-in account, retained through token rotation/navigation.
 * The initial unread page is a baseline, not fifty old popup messages. */
export function createForegroundMessageTracker() {
  let initialised = false;
  let floor: ForegroundMessage | undefined;
  const seen = new Set<string>();
  const afterFloor = (item: ForegroundMessage) =>
    !floor ||
    item.createdAt > floor.createdAt ||
    (item.createdAt === floor.createdAt && item.id > floor.id);
  return {
    observe(items: ForegroundMessage[]) {
      if (!initialised) {
        initialised = true;
        floor = items.at(-1);
        items.forEach((item) => seen.add(item.id));
        return [];
      }
      const fresh = items.filter(
        (item) =>
          !seen.has(item.id) && item.readAt === null && afterFloor(item),
      );
      items.forEach((item) => seen.add(item.id));
      return fresh.reverse();
    },
  };
}
