// The HTTPS demo alias keeps database image safeguards intact. Only these
// explicitly synthetic, vendored assets resolve to the current web origin.
export function productImageSource(source: string): string {
  return /^https:\/\/demo\.auction\.invalid\/demo\/(?:[a-z]+|product-\d+)-(thumb|display)\.webp$/.test(
    source,
  )
    ? new URL(source).pathname
    : source;
}
