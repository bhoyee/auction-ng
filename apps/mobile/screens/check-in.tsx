import { PrivateQr } from '../components/ui/private-qr';
import { useState } from 'react';
import { View } from 'react-native';
import { createPickupVisitClient } from '@auction-ng/api-client/pickup-visits';
import type { PickupVisitPass } from '@auction-ng/shared';
import { Page, Private, Notice, Pagination } from '../components/ui/page';
import { Body, Button } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { apiUrl } from '../lib/config';
import { useTick } from '../lib/clock';
import { countdown } from '@auction-ng/ui/presentation';
export default function CheckInScreen() {
  const { manager, session } = useSession();
  const [pass, setPass] = useState<PickupVisitPass>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [pages, setPages] = useState<(string | undefined)[]>([]);
  const now = useTick();
  const centres = useLiveRead(
    () =>
      manager.run((c) =>
        createPickupVisitClient(apiUrl, c).centres({ limit: 10, cursor }),
      ),
    [cursor, session?.user.id],
    5000,
  );
  const status = useLiveRead(
    () => {
      if (!pass) throw Error('No pass');
      return manager.run((c) =>
        createPickupVisitClient(apiUrl, c).pass(pass.id),
      );
    },
    [pass?.id],
    5000,
  );
  const current = status.data ?? pass;
  async function prepare(locationId: string, renew = false) {
    setBusy(true);
    try {
      setPass(
        await manager.run((c) =>
          createPickupVisitClient(apiUrl, c).prepare(locationId, renew),
        ),
      );
    } catch {
      setError(
        'Could not prepare your pickup pass. Retry at the collection centre.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page title="Check-in">
      <Private>
        <Notice
          message={error || centres.error}
          onClose={() => {
            setError('');
            centres.refresh();
          }}
        />
        <Body>
          At the collection centre? Show your private pass to staff. Arrival
          starts when staff scan or enter your pass.
        </Body>
        {current ? (
          <View style={n.surface}>
            <Body tone="section">{current.location.name}</Body>
            <Body>{current.location.address}</Body>
            {Date.parse(current.expiresAt) > now ? (
              <>
                <PrivateQr
                  value={current.token}
                  label="Private pickup pass QR code"
                />
                <Body tone="secondary">Private staff check-in code</Body>
                <Body selectable style={[n.price, { letterSpacing: 4 }]}>
                  {current.code}
                </Body>
                <Body>
                  Expires in{' '}
                  {countdown(Date.parse(current.expiresAt), now).text}
                </Body>
              </>
            ) : (
              <Notice
                tone="warning"
                message="This pass expired. Prepare a fresh pass."
              />
            )}
            {current.visit && (
              <Notice
                tone={
                  current.visit.status === 'completed' ? 'success' : 'warning'
                }
                message={
                  current.visit.status === 'completed'
                    ? 'Collection visit completed.'
                    : 'Visit ' +
                      current.visit.status +
                      '. Staff will help you collect your items.'
                }
              />
            )}
            <Button
              busy={busy}
              onPress={() => void prepare(current.location.id, true)}
            >
              Refresh pickup pass
            </Button>
            <Body tone="fine">
              Do not share this code. Inspect and test items before leaving the
              collection centre.
            </Body>
          </View>
        ) : (
          centres.data?.items.map((centre) => (
            <View style={n.surface} key={centre.id}>
              <Body tone="section">{centre.name}</Body>
              <Body>{centre.address}</Body>
              <Body>{centre.orderCount} paid orders awaiting collection</Body>
              <Button
                busy={busy}
                disabled={!centre.orderCount}
                onPress={() => void prepare(centre.id)}
              >
                Prepare my pickup pass
              </Button>
            </View>
          ))
        )}
        {centres.data?.items.length === 0 && (
          <Body>You have no paid items awaiting pickup.</Body>
        )}
        <Pagination
          previous={
            pages.length
              ? () => {
                  setCursor(pages.at(-1));
                  setPages((p) => p.slice(0, -1));
                }
              : undefined
          }
          next={
            centres.data?.nextCursor
              ? () => {
                  setPages((p) => [...p, cursor]);
                  setCursor(centres.data?.nextCursor ?? undefined);
                }
              : undefined
          }
        />
      </Private>
    </Page>
  );
}
