export function isBuyerEligible(user: {
  role: string;
  status: string;
  emailVerified: boolean;
}): boolean {
  return (
    user.role === 'buyer' && user.status === 'active' && user.emailVerified
  );
}
