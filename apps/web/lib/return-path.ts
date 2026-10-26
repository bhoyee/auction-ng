export function safeBuyerReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return '/account';
  try {
    const url = new URL(value, 'https://auction.invalid');
    if (
      url.origin !== 'https://auction.invalid' ||
      /^\/sign-(in|up)(\/|$)/.test(url.pathname)
    )
      return '/account';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/account';
  }
}
