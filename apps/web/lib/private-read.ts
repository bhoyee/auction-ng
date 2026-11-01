'use client';
import { useWalletRead } from './wallet-read';

export function usePrivateRead<T>(
  read: (credentials: { accessToken: string; deviceId: string }) => Promise<T>,
) {
  return useWalletRead(read);
}
