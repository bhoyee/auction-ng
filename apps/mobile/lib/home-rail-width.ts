import { tokens } from '../../../packages/ui/tokens';

export function homeRailWidth(width: number, count: number, closing: boolean) {
  if (closing && count === 1)
    return Math.max(
      0,
      Math.min(width, tokens.layout.content) - 2 * tokens.spacing.lg,
    );
  return width >= 768
    ? (Math.min(width, tokens.layout.content) - 80) / 4
    : width * 0.46;
}
