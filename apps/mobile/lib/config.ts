import Constants from 'expo-constants';
function origin(value: string | undefined, port: number) {
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  const url = new URL(value ?? `http://${host}:${port}`);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw Error('Invalid public mobile service URL.');
  if (!__DEV__ && url.protocol !== 'https:')
    throw Error('Published mobile builds require HTTPS.');
  return url.origin;
}
export const apiUrl = origin(process.env.EXPO_PUBLIC_API_URL, 4000);
export const webUrl = origin(process.env.EXPO_PUBLIC_WEB_URL, 3300);
export const realtimeUrl = origin(process.env.EXPO_PUBLIC_REALTIME_URL, 4001);
export function safeMobilePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value) ||
    /^\/(sign-in|design)(\?|$)/.test(value)
  )
    return '/';
  return /^\/(lots\/[0-9a-f-]{36}|invoices\/[0-9a-f-]{36}|wallet|watchlist|account|orders|bids|notifications|support|check-in|upcoming|browse)(\?|$)/.test(
    value,
  )
    ? value
    : '/';
}
