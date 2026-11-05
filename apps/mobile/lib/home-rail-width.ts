import { tokens } from '../../../packages/ui/tokens';

export function homeRailWidth(width: number, count: number) {
  if (count === 1)
    return Math.max(
      0,
      Math.min(width, tokens.layout.content) - 2 * tokens.spacing.lg,
    );
  return width >= 768
    ? (Math.min(width, tokens.layout.content) - 80) / 4
    : width * 0.46;
}

export function homeGridWidth(width: number, count: number) {
  const columns = count === 1 ? 1 : width >= 768 ? 4 : 2;
  return Math.max(
    0,
    (Math.min(width, tokens.layout.content) -
      2 * tokens.spacing.lg -
      (columns - 1) * tokens.spacing.md) /
      columns,
  );
}
