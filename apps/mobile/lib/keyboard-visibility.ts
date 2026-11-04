export function keyboardOverlap(
  viewTop: number,
  viewHeight: number,
  keyboardTop: number | null,
) {
  return keyboardTop === null
    ? 0
    : Math.max(0, Math.min(viewHeight, viewTop + viewHeight - keyboardTop));
}

export function focusedFieldScroll(
  inputBottom: number,
  viewportBottom: number,
  keyboardTop: number,
  scrollY: number,
  gap: number,
) {
  const hidden = inputBottom + gap - Math.min(viewportBottom, keyboardTop);
  return hidden > 0 ? Math.max(0, scrollY + hidden) : null;
}

export function focusFieldNearTop(
  inputTop: number,
  viewportTop: number,
  scrollY: number,
  labelSpace: number,
) {
  return Math.max(0, scrollY + inputTop - viewportTop - labelSpace);
}
