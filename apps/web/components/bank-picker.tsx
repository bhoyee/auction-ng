'use client';
import { useEffect, useState } from 'react';
import { createPaymentClient } from '@auction-ng/api-client/payments';
import type { PaymentBankPage } from '@auction-ng/shared';
import {
  Button,
  BuyerStack,
  EmptyState,
  ErrorState,
  Select,
} from '@auction-ng/ui/web';
import { apiUrl, useBuyer } from '../lib/session';
export function BankPicker({
  disabled,
  onAvailable,
}: {
  disabled: boolean;
  onAvailable: (value: boolean) => void;
}) {
  const { tokens, deviceId } = useBuyer();
  const [banks, setBanks] = useState<PaymentBankPage['items']>([]);
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    onAvailable(banks.length > 0);
  }, [banks.length, onAvailable]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    if (tokens)
      void createPaymentClient(apiUrl, {
        accessToken: tokens.accessToken,
        deviceId,
      })
        .getBanks({ limit: 50, cursor })
        .then((value) => {
          if (!active) return;
          setBanks((previous) => [
            ...new Map(
              [...(cursor ? previous : []), ...value.items].map((bank) => [
                bank.code,
                bank,
              ]),
            ).values(),
          ]);
          setNext(value.nextCursor);
        })
        .catch(() => {
          if (active) setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [tokens, deviceId, cursor, version]);
  return (
    <BuyerStack>
      <Select
        name="bankCode"
        label="Your bank"
        defaultValue=""
        required
        disabled={disabled || !banks.length}
      >
        <option value="" disabled>
          Choose your bank
        </option>
        {banks.map((bank) => (
          <option key={bank.code} value={bank.code}>
            {bank.name}
          </option>
        ))}
      </Select>
      {loading && (
        <p role="status" aria-busy="true">
          Loading supported banks…
        </p>
      )}
      {!loading && !error && !banks.length && (
        <EmptyState title="No banks loaded yet">
          Try loading another page, or try again later.
        </EmptyState>
      )}
      {error && (
        <ErrorState
          title="Banks could not be loaded"
          onRetry={() => setVersion((value) => value + 1)}
        >
          Try again before requesting your transfer account.
        </ErrorState>
      )}
      {next && (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || loading}
          onClick={() => setCursor(next ?? undefined)}
        >
          Load more banks
        </Button>
      )}
    </BuyerStack>
  );
}
