/**
 * Font size that keeps a Naira amount on one straight line inside a box
 * (owner request, 2026-11-20): large for ₦12,500, smaller for
 * ₦1,234,567,890. Tabular digits in the brand font average about 0.6 of
 * the font size per character; commas and ₦ are counted as characters.
 */
export function amountFontSize(
  text: string,
  width: number,
  { max = 28, min = 13, perChar = 0.6 } = {},
) {
  if (!(width > 0) || !text) return max;
  const size = width / (Math.max(text.length, 1) * perChar);
  return Math.max(min, Math.min(max, Math.floor(size)));
}

/** "Gideon Okafor" → "GO"; a single name gives one letter. */
export function initials(name: string | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('en-NG') ?? '');
  return letters.join('') || '?';
}

/** First name for the greeting, with a friendly fallback. */
export function firstName(name: string | undefined) {
  return (name ?? '').trim().split(/\s+/)[0] || 'there';
}
