'use client';
import { useEffect, useState } from 'react';
import { readAuctionFees } from '@auction-ng/api-client/auction-fees';
import type { AuctionFeeQuote } from '@auction-ng/shared/auction-fee-schemas';
import { apiUrl } from './session';
export function useAuctionFees(lotId: string) {
  const [quote, setQuote] = useState<AuctionFeeQuote>();
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      busy = false;
    setQuote(undefined);
    setFresh(false);
    setError(false);
    const read = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const value = await readAuctionFees(apiUrl, lotId);
        if (active) {
          setQuote(value);
          setFresh(true);
          setError(false);
        }
      } catch {
        if (active) {
          setFresh(false);
          setError(true);
        }
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), 15000);
    window.addEventListener('focus', read);
    window.addEventListener('online', read);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', read);
      window.removeEventListener('online', read);
    };
  }, [lotId]);
  return { quote, fresh, error };
}
