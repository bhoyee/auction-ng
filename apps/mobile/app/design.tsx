import { useState } from 'react';
import { Redirect } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Badge,
  Body,
  Button,
  Countdown,
  DesignSection,
  Dialog,
  EmptyState,
  ErrorState,
  Footer,
  Header,
  Input,
  LivePill,
  LotCard,
  LotCardSkeleton,
  LotGrid,
  NairaInput,
  OfflineBanner,
  OtpInput,
  Price,
  Row,
  Select,
  Stack,
  Tabs,
  Toast,
  styles,
} from '../components/ui';

const now = Date.UTC(2026, 9, 25, 18);

export default function DesignPreview() {
  const [tab, setTab] = useState('winning');
  const [watched, setWatched] = useState(false);
  const [dialog, setDialog] = useState<'dialog' | 'sheet' | undefined>();
  const [message, setMessage] = useState<string>();
  const [location, setLocation] = useState('ikeja');
  const [amount, setAmount] = useState<number | undefined>(1250000);
  const [price, setPrice] = useState(1250000);
  if (process.env.NODE_ENV === 'production') return <Redirect href="/" />;
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Header>
          <Badge tone="brand">Design review · D01</Badge>
        </Header>
        <View style={styles.content}>
          <Stack>
            <Body tone="title" accessibilityRole="header">
              The Auction NG toolkit
            </Body>
            <Body tone="secondary">
              A working reference for the details buyers will touch every day.
              No bids or payments are connected.
            </Body>
          </Stack>
          <DesignSection
            title="Actions with a clear purpose"
            description="Adire indigo, a cool grey canvas and touch targets of at least 44 pixels."
          >
            <Stack>
              <Button
                onPress={() =>
                  setMessage('This is a preview. No bid was placed.')
                }
              >
                Place bid ₦12,500
              </Button>
              <Row>
                <Button variant="secondary" onPress={() => setDialog('dialog')}>
                  View pickup details
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => setMessage('Preview watchlist opened.')}
                >
                  View watchlist
                </Button>
                <Button variant="danger" onPress={() => setDialog('dialog')}>
                  Cancel request
                </Button>
              </Row>
              <Row>
                <Button
                  size="small"
                  onPress={() => setMessage('Small action selected.')}
                >
                  Small action
                </Button>
                <Button
                  size="regular"
                  onPress={() => setMessage('Regular action selected.')}
                >
                  Regular action
                </Button>
                <Button
                  size="large"
                  onPress={() => setMessage('Large action selected.')}
                >
                  Large action
                </Button>
              </Row>
              <Button disabled>Place bid ₦12,500</Button>
              <Button busy>Place bid</Button>
            </Stack>
          </DesignSection>
          <DesignSection
            title="Fields that explain themselves"
            description="Visible labels, numeric keyboards and useful errors."
          >
            <Stack>
              <Input
                label="Email address"
                keyboardType="email-address"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="chiamaka@example.com"
                hint="We will send your sign-in code here."
              />
              <Input
                label="Phone number"
                keyboardType="phone-pad"
                defaultValue="0803"
                error="Enter a complete Nigerian number, such as 0803 123 4567."
              />
              <OtpInput
                label="Six-digit sign-in code"
                hint="Use the latest code sent to your email."
                placeholder="123456"
              />
              <NairaInput
                defaultValue="12500"
                onAmountChange={setAmount}
                hint={
                  amount === undefined
                    ? 'Enter an amount with up to two decimal places.'
                    : 'The full cost is shown before confirmation.'
                }
              />
              <Select
                label="Pickup location"
                value={location}
                onChange={setLocation}
                options={[
                  { value: 'ikeja', label: 'Ikeja, Lagos' },
                  { value: 'lekki', label: 'Lekki, Lagos · example' },
                ]}
              />
            </Stack>
          </DesignSection>
          <DesignSection
            title="Signals, prices and time"
            description="Every status uses words as well as colour. Yellow means live or closing."
          >
            <Stack>
              <Row>
                <Badge>Open box</Badge>
                <Badge tone="brand">Scheduled</Badge>
                <Badge tone="win">You're winning</Badge>
                <Badge tone="outbid">Outbid</Badge>
                <LivePill />
              </Row>
              <Row>
                <Countdown endsAt={now + 89000} serverNow={now} />
                <Countdown endsAt={now + 3600000} serverNow={now} />
                <Countdown endsAt={now - 1} serverNow={now} />
              </Row>
              <Price kobo={price} />
              <Button
                variant="secondary"
                onPress={() => setPrice((value) => value + 25000)}
              >
                Preview a price update
              </Button>
            </Stack>
          </DesignSection>
          <DesignSection
            title="The lot card"
            description="Seeded photo-pending examples. Disconnected cards hide the price."
          >
            <LotGrid>
              <>
                <LotCard
                  title="Hisense 20-litre microwave"
                  reference="LOT-K7M4X9Q2"
                  condition="open_box"
                  priceKobo={1250000}
                  retailKobo={6500000}
                  endsAt={now + 89000}
                  serverNow={now}
                  live
                  watched={watched}
                  onWatch={() => setWatched(!watched)}
                  onOpen={() => setDialog('sheet')}
                  status="Winning"
                />
              </>
              <>
                <LotCard
                  title="Philips steam iron"
                  reference="LOT-R8V3N6TZ"
                  condition="like_new"
                  priceKobo={500000}
                  retailKobo={2400000}
                  endsAt={now + 1800000}
                  serverNow={now}
                  live
                  watched={false}
                  onWatch={() =>
                    setMessage('Iron added to the preview watchlist.')
                  }
                  onOpen={() => setDialog('sheet')}
                  status="Outbid"
                />
              </>
              <>
                <LotCard
                  title="Russell Hobbs kettle"
                  reference="LOT-3RY6VPLP"
                  condition="untested"
                  priceKobo={350000}
                  endsAt={now + 500000}
                  serverNow={now}
                  live={false}
                  watched={false}
                  onWatch={() =>
                    setMessage('Kettle added to the preview watchlist.')
                  }
                  onOpen={() => setDialog('sheet')}
                />
              </>
              <>
                <LotCardSkeleton />
              </>
            </LotGrid>
          </DesignSection>
          <DesignSection
            title="The less certain moments"
            description="Empty, error, offline and success are part of the system."
          >
            <Stack>
              <OfflineBanner />
              <EmptyState
                title="Your watchlist is empty"
                action={
                  <Button
                    variant="secondary"
                    onPress={() =>
                      setMessage(
                        'The catalogue will be connected in the buyer app.',
                      )
                    }
                  >
                    Browse lots
                  </Button>
                }
              >
                Save a lot to find it here before it closes.
              </EmptyState>
              <ErrorState
                onRetry={() => setMessage('Preview retry completed.')}
              />
              <Toast onClose={() => setMessage('Message dismissed.')}>
                Your pickup details have been saved.
              </Toast>
              <Toast
                tone="error"
                onClose={() => setMessage('Message dismissed.')}
              >
                Your request was not saved. Check your connection and try again.
              </Toast>
            </Stack>
          </DesignSection>
          <DesignSection
            title="Tabs, dialogs and bottom sheets"
            description="Accessible selected states and native modal dismissal."
          >
            <Stack>
              <Tabs
                label="Bid status examples"
                value={tab}
                onChange={setTab}
                items={[
                  {
                    value: 'winning',
                    label: 'Winning',
                    panel: (
                      <Body tone="secondary">
                        You are leading on the Hisense microwave.
                      </Body>
                    ),
                  },
                  {
                    value: 'outbid',
                    label: 'Outbid',
                    panel: (
                      <Body tone="secondary">
                        Someone placed a higher bid on the Philips iron.
                      </Body>
                    ),
                  },
                  {
                    value: 'won',
                    label: 'Won',
                    panel: (
                      <Body tone="secondary">
                        Paid lots and pickup details will appear here.
                      </Body>
                    ),
                  },
                ]}
              />
              <Button variant="secondary" onPress={() => setDialog('dialog')}>
                Open dialog preview
              </Button>
              <Button variant="secondary" onPress={() => setDialog('sheet')}>
                Open bottom sheet preview
              </Button>
            </Stack>
          </DesignSection>
          <Footer />
        </View>
      </ScrollView>
      <Dialog
        open={dialog !== undefined}
        title="Ikeja pickup hub"
        presentation={dialog ?? 'dialog'}
        onClose={() => setDialog(undefined)}
      >
        <Stack>
          <Body tone="secondary">
            This is a component preview. Warehouse settings will provide pickup
            hours and collection instructions.
          </Body>
          <Button onPress={() => setDialog(undefined)}>
            Close pickup preview
          </Button>
        </Stack>
      </Dialog>
      <Dialog
        open={message !== undefined}
        title="Preview feedback"
        onClose={() => setMessage(undefined)}
      >
        <Toast onClose={() => setMessage(undefined)}>{message ?? ''}</Toast>
      </Dialog>
    </SafeAreaView>
  );
}
