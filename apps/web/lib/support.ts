// Keep public contact configuration server-side; never invent a support number.
export function publicSocialLinks() {
  const configured = {
    x: process.env.SOCIAL_X_URL,
    facebook: process.env.SOCIAL_FACEBOOK_URL,
    instagram: process.env.SOCIAL_INSTAGRAM_URL,
    tiktok: process.env.SOCIAL_TIKTOK_URL,
  };
  return Object.fromEntries(
    Object.entries(configured).flatMap(([name, value]) => {
      try {
        const url = new URL(value ?? '');
        return url.protocol === 'https:' && !url.username && !url.password
          ? [[name, url.href]]
          : [];
      } catch {
        return [];
      }
    }),
  );
}
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
