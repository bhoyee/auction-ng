export function webVersionChanged(loaded: string, available: unknown) {
  return (
    typeof available === 'string' &&
    available.length > 0 &&
    loaded !== 'development' &&
    available !== 'development' &&
    loaded !== available
  );
}
