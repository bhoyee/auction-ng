export const cookieNoticeKey = 'auction-ng-cookie-notice';
export const cookieNoticeLifetimeMs = 180 * 24 * 60 * 60 * 1000;
export function hasCookieAcknowledgement(value: string | null, now: number) {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('acknowledgedAt' in parsed) ||
      typeof parsed.acknowledgedAt !== 'number' ||
      !Number.isSafeInteger(parsed.acknowledgedAt)
    )
      return false;
    return (
      parsed.acknowledgedAt <= now &&
      now - parsed.acknowledgedAt < cookieNoticeLifetimeMs
    );
  } catch {
    return false;
  }
}
