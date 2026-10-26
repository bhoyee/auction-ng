'use client';
import { useState } from 'react';
import {
  Badge,
  Button,
  BuyerLink,
  BuyerPage,
  BuyerPanel,
  BuyerRow,
  BuyerStack,
  Input,
} from '@auction-ng/ui/web';
import { useBuyer } from '../lib/session';

export function Account() {
  const { tokens, auth, setTokens, updateUser } = useBuyer();
  const [name, setName] = useState(tokens?.user.name ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <BuyerPage narrow title="Your account">
      <BuyerPanel>
        <BuyerStack>
          <p>{tokens?.user.email}</p>
          <Badge>
            {tokens?.user.phoneVerified
              ? 'Phone verified'
              : 'Phone verification required before bidding'}
          </Badge>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!tokens || !auth || busy) return;
              setBusy(true);
              void auth
                .updateProfile(tokens.accessToken, name)
                .then((user) => {
                  updateUser(user);
                  setMessage('Your name has been saved.');
                })
                .catch(() =>
                  setMessage('Your name could not be saved. Try again.'),
                )
                .finally(() => setBusy(false));
            }}
          >
            <BuyerStack>
              <Input
                label="Your name"
                autoComplete="name"
                value={name}
                minLength={1}
                maxLength={120}
                required
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" busy={busy}>
                Save name
              </Button>
            </BuyerStack>
          </form>
          <BuyerRow>
            <BuyerLink href="/wallet">Your wallet</BuyerLink>
            <BuyerLink href="/invoices">Invoices and pickup</BuyerLink>
          </BuyerRow>
          {message && <p role="status">{message}</p>}
          <Button
            variant="secondary"
            busy={busy}
            onClick={() => {
              if (!auth) return;
              setBusy(true);
              void auth
                .logout()
                .then(() => {
                  setTokens(null);
                })
                .catch(() =>
                  setMessage(
                    'Sign-out could not be confirmed. Reconnect and try again.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            Sign out
          </Button>
        </BuyerStack>
      </BuyerPanel>
    </BuyerPage>
  );
}
