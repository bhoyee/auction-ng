/** @param {string} address */
function isPrivateAddress(address) {
  if (address !== address.trim()) return false;
  const octets = address.split('.');
  if (
    octets.length !== 4 ||
    octets.some(
      (part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255,
    )
  )
    return false;
  const [first, second] = octets.map(Number);
  return (
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

/** @param {Record<string, readonly {address:string, family:string|number, internal:boolean}[] | undefined>} interfaces
 * @param {string | undefined} preferred */
function selectMobileAddress(interfaces, preferred) {
  const addresses = Object.entries(interfaces).flatMap(([name, items]) =>
    (items ?? [])
      .filter(
        (item) =>
          !item.internal &&
          (item.family === 'IPv4' || item.family === 4) &&
          isPrivateAddress(item.address),
      )
      .map((item) => ({ name, address: item.address })),
  );
  if (preferred) {
    if (
      !isPrivateAddress(preferred) ||
      !addresses.some((item) => item.address === preferred)
    )
      throw Error(
        'MOBILE_BIND_ADDRESS must be a private IPv4 address on this computer.',
      );
    return preferred;
  }
  const physical = addresses.filter(
    (item) =>
      !/vethernet|docker|wsl|virtual|vpn|loopback|tailscale/i.test(item.name),
  );
  const wifi = physical.filter((item) =>
    /wi-?fi|wireless|wlan/i.test(item.name),
  );
  const candidates = [
    ...new Set((wifi.length ? wifi : physical).map((item) => item.address)),
  ];
  if (candidates.length !== 1)
    throw Error(
      "Connect to Wi-Fi, or set MOBILE_BIND_ADDRESS to this computer's private LAN IPv4 address.",
    );
  return candidates[0];
}
module.exports = { isPrivateAddress, selectMobileAddress };
