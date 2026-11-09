/** Scroll just enough to keep the entire focused input above a resized viewport. */
export function focusedFieldOffset(
  offset: number,
  viewportTop: number,
  viewportHeight: number,
  inputTop: number,
  inputHeight: number,
  gap: number,
) {
  const overlap = Math.max(
    0,
    inputTop + inputHeight + gap - (viewportTop + viewportHeight),
  );
  return Math.max(0, offset + overlap);
}
