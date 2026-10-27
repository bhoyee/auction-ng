export function catalogueLotVisible(
  status: string,
  endsAt: string,
  serverNow: number,
) {
  return (
    ['scheduled', 'open', 'closing'].includes(status) &&
    (serverNow === 0 || Date.parse(endsAt) > serverNow)
  );
}
