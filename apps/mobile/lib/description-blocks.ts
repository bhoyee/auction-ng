export type DescriptionBlock =
  { kind: 'heading'; text: string } | { kind: 'text'; text: string };

/**
 * Splits a staff-written lot description into headings and text (owner
 * request, 2026-11-21): a short line of its own that ends in ":" or "?"
 * ("Key features:", "Who is this for?") is a heading; everything else,
 * including "Display: 6.1-inch" detail lines, stays regular text. Blank
 * lines separate paragraphs; consecutive text lines stay separate rows.
 */
export function descriptionBlocks(description: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const raw of description.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    blocks.push(
      isHeading(line)
        ? { kind: 'heading', text: line.replace(/:$/, '') }
        : { kind: 'text', text: line },
    );
  }
  return blocks;
}

function isHeading(line: string) {
  if (line.length > 48 || !/[:?]$/.test(line)) return false;
  const body = line.slice(0, -1);
  // "Display: 6.1-inch" has content after an inner colon, so it is a detail.
  if (body.includes(':')) return false;
  return body.trim().split(/\s+/).length <= 6;
}
