// Keep public contact configuration server-side; never invent a support number.
export function publicSupportEmail() {
  const email = process.env.SUPPORT_EMAIL?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : 'info@auctionng.com';
}
export function whatsappContact(
  number: string | undefined,
): string | undefined {
  const normalized = number?.trim();
  return normalized && /^\+[1-9][0-9]{7,14}$/.test(normalized)
    ? `https://wa.me/${normalized.slice(1)}`
    : undefined;
}
