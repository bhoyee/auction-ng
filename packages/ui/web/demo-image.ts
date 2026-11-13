// The HTTPS demo alias keeps database image safeguards intact. Only these
// explicitly synthetic, vendored assets resolve to the current web origin.
// Development photos (local store, no R2) use the same HTTPS alias trick and
// are redirected to the API by the web and admin apps.
const DEV_IMAGE =
  /^https:\/\/dev-images\.auction\.invalid\/(catalogue\/[A-Za-z0-9/_.-]+\.webp)$/;
export function productImageSource(source: string): string {
  const dev = DEV_IMAGE.exec(source);
  if (dev) return `/dev-images/public/${dev[1]}`;
  return /^https:\/\/demo\.auction\.invalid\/demo\/(?:[a-z]+|product-\d+)-(thumb|display)\.webp$/.test(
    source,
  )
    ? new URL(source).pathname
    : source;
}
