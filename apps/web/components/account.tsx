'use client';
import { useState } from 'react';
import { Badge } from '@auction-ng/ui/web/auction';
import { Button } from '@auction-ng/ui/web/button';
import {
  BuyerLink,
  BuyerPanel,
  BuyerRow,
  BuyerStack,
} from '@auction-ng/ui/web/buyer';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import { Input } from '@auction-ng/ui/web/input';
import { useBuyer } from '../lib/session';

export function Account() {
  const { tokens, auth, setTokens, updateUser } = useBuyer();
  const [name, setName] = useState(tokens?.user.name ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <BuyerPage narrow title="Profile">
      <BuyerPanel>
        <BuyerStack>
          <p>{tokens?.user.email}</p>
          <Badge>
            {tokens?.user.emailVerified
              ? 'Email verified'
              : 'Email verification required before bidding'}
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
