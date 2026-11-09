export function dropdownPosition(
  anchor: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number; top: number; bottom: number },
  desiredHeight: number,
  gap: number,
) {
  const below = Math.max(
    0,
    viewport.height - viewport.bottom - anchor.y - anchor.height - gap,
  );
  const above = Math.max(0, anchor.y - viewport.top - gap);
  const opensBelow = below >= desiredHeight || below >= above;
  const height = Math.min(desiredHeight, opensBelow ? below : above);
  const width = Math.min(anchor.width, Math.max(0, viewport.width - 2 * gap));
  return {
    left: Math.max(gap, Math.min(anchor.x, viewport.width - width - gap)),
    top: opensBelow ? anchor.y + anchor.height + gap : anchor.y - height - gap,
    width,
    maxHeight: height,
  };
}
