export function isPrivateAddress(address: string): boolean;
export function selectMobileAddress(
  interfaces: Record<
    string,
    | readonly { address: string; family: string | number; internal: boolean }[]
    | undefined
  >,
  preferred?: string,
): string;
