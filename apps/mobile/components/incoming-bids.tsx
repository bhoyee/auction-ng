import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { createBuyerClient } from '@auction-ng/api-client';
import { formatNaira } from '@auction-ng/shared';
import { Body, Button } from './ui/controls';
import { Notice, Loading, Pagination } from './ui/page';
import { AuctionCountdown } from './ui/auction-countdown';
import { n } from './ui/native-styles';
import { bidHistoryStyles as bh } from './ui/bid-history-styles';
import { useSession } from '../lib/session';
import { useLiveRead } from '../lib/live-read';
import { useTick } from '../lib/clock';
import { apiUrl } from '../lib/config';
import { photoUrl } from '../screens/catalogue';

export function IncomingBids({ cancelled = false }: { cancelled?: boolean }) {
  const { manager, session } = useSession();
  const router = useRouter();
  const now = useTick();
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const read = useLiveRead(
    () =>
      manager.run((credentials) =>
        createBuyerClient(apiUrl, credentials).preBids(
          cancelled ? 'cancelled' : 'incoming',
          { limit: 10, cursor: pages.at(-1) },
        ),
      ),
    [session?.user.id, cancelled, pages.at(-1)],
    5000,
  );
  return (
    <View style={bh.incomingList}>
      <Body style={bh.title}>
        {cancelled ? 'Cancelled pre-bids' : 'Your incoming pre-bids'}
      </Body>
      <Notice message={read.error} onClose={read.refresh} />
      {!read.data && !read.error && <Loading />}
      {read.data?.items.map((item) => (
        <View key={item.id} style={n.surface}>
          <View style={bh.itemHeading}>
            <Image
              source={photoUrl(item.lot.thumbnailUrl)}
              style={bh.thumbnail}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View style={bh.itemText}>
              <Body style={bh.title} numberOfLines={2}>
                {item.lot.title}
              </Body>
              <Body tone="fine">Item {item.lot.lotNumber}</Body>
            </View>
          </View>
          {!cancelled && (
            <>
              <Body tone="fine" style={n.bold}>
                Goes live in
              </Body>
              {now > 0 && now < Date.parse(item.startsAt) ? (
                <AuctionCountdown
                  upcoming
                  endsAt={Date.parse(item.startsAt)}
                  serverNow={now}
                  live
                />
              ) : (
                <Body>Launch is being confirmed</Body>
              )}
            </>
          )}
          <Body tone="fine">
            {new Date(item.startsAt).toLocaleString('en-NG', {
              timeZone: 'Africa/Lagos',
            })}{' '}
            WAT
          </Body>
          <View style={bh.amountPanel}>
            <Body tone="fine" style={n.grow}>
              Your private limit
            </Body>
            <Body
              style={n.historyAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatNaira(item.maxKobo)}
            </Body>
          </View>
          <View style={bh.amountPanel}>
            <Body tone="fine" style={n.grow}>
              Reserved in wallet
            </Body>
            <Body
              style={n.historyAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatNaira(item.reservedKobo)}
            </Body>
          </View>
          <Button fullWidth onPress={() => router.push(`/lots/${item.lotId}`)}>
            {cancelled
              ? 'View item'
              : item.status === 'active' &&
                  now > 0 &&
                  now < Date.parse(item.startsAt)
                ? 'Change or cancel pre-bid'
                : 'View launch status'}
          </Button>
          {!cancelled && (
            <Body tone="fine">
              Change your limit or cancel free before launch. Manage your
              pre-bid on the item page.
            </Body>
          )}
        </View>
      ))}
      {read.data?.items.length === 0 && (
        <View style={n.surface}>
          <Body>
            {cancelled ? 'No cancelled pre-bids.' : 'No incoming pre-bids yet.'}
          </Body>
          {!cancelled && (
            <Button onPress={() => router.push('/upcoming')}>
              Browse upcoming deals
            </Button>
          )}
        </View>
      )}
      <Pagination
        previous={
          pages.length > 1
            ? () => setPages((value) => value.slice(0, -1))
            : undefined
        }
        next={
          read.data?.nextCursor
            ? () =>
                setPages((value) => [
                  ...value,
                  read.data?.nextCursor ?? undefined,
                ])
            : undefined
        }
      />
    </View>
  );
}
