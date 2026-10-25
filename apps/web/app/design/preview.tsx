'use client';

import { useState } from 'react';
import { tokens } from '@auction-ng/ui';
import {
  Badge,
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
  NairaInput,
  OfflineBanner,
  OtpInput,
  Price,
  Select,
  Tabs,
  Toast,
} from '@auction-ng/ui/web';

const now = Date.UTC(2026, 9, 25, 18);

export function DesignPreview() {
  const [dialog, setDialog] = useState<'dialog' | 'sheet' | undefined>();
  const [tab, setTab] = useState('winning');
  const [watched, setWatched] = useState(false);
  const [toast, setToast] = useState<string>();
  const [amount, setAmount] = useState<number | undefined>(1250000);
  const [price, setPrice] = useState(1250000);
  return (
    <>
      <Header
        account={<Badge tone="brand">Design review</Badge>}
        search={
          <>
            <label className="agn-sr-only" htmlFor="design-search">
              Search example
            </label>
            <input
              className="agn-input"
              id="design-search"
              placeholder="Search lots, brands and categories"
              type="search"
            />
          </>
        }
      />
      <main className="agn-container">
        <div className="agn-design-intro">
          <div>
            <h1>The Auction NG toolkit</h1>
            <p>
              A working reference for the details buyers will touch every day.
              Calm surfaces, clear amounts and live signals that mean something.
            </p>
          </div>
          <Badge>Component preview · D01</Badge>
        </div>
        <DesignSection
          number="01"
          title="A quiet foundation"
          description="Schibsted Grotesk, adire indigo and a cool grey canvas. Yellow is reserved for live and closing states."
        >
          <div className="agn-stack">
            <div className="agn-swatch-grid">
              {Object.entries(tokens.colors)
                .filter(([name]) => name !== 'danfo-400')
                .map(([name, color]) => (
                  <div className="agn-swatch" key={name}>
                    <div
                      className="agn-swatch-color"
                      style={{ backgroundColor: color }}
                    />
                    <span>{name}</span>
                  </div>
                ))}
            </div>
            <div className="agn-two-columns">
              <div>
                <p className="agn-type-title">Good finds. Clear prices.</p>
                <p className="agn-type-body">
                  Collect your winning lots from Ikeja, Lagos.
                </p>
              </div>
              <div>
                <Price kobo={1250000} />
                <p className="agn-hint">
                  Tabular numbers keep changing prices steady.
                </p>
                <p className="agn-type-fine">
                  Fine print is reserved for supporting details.
                </p>
              </div>
            </div>
          </div>
        </DesignSection>
        <DesignSection
          number="02"
          title="Actions with a clear purpose"
          description="Four variants, three sizes, visible keyboard focus and touch targets of at least 44 pixels."
        >
          <div className="agn-stack">
            <div className="agn-row">
              <Button
                onClick={() =>
                  setToast('This is a preview. No bid was placed.')
                }
              >
                Place bid ₦12,500
              </Button>
              <Button variant="secondary" onClick={() => setDialog('dialog')}>
                View pickup details
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setToast('Saved lots will appear in your watchlist.')
                }
              >
                View watchlist
              </Button>
              <Button variant="danger" onClick={() => setDialog('dialog')}>
                Cancel request
              </Button>
            </div>
            <div className="agn-row">
              <Button size="small">Small action</Button>
              <Button size="regular">Regular action</Button>
              <Button size="large">Large action</Button>
              <Button disabled>Place bid ₦12,500</Button>
              <Button busy>Place bid</Button>
            </div>
          </div>
        </DesignSection>
        <DesignSection
          number="03"
          title="Fields that explain themselves"
          description="Labels stay visible. Numeric keyboards, code autofill and useful errors make forms easier on a phone."
        >
          <div className="agn-two-columns">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="chiamaka@example.com"
              hint="We will send your sign-in code here."
            />
            <Input
              label="Phone number"
              type="tel"
              autoComplete="tel"
              defaultValue="0803"
              error="Enter a complete Nigerian number, such as 0803 123 4567."
            />
            <OtpInput
              label="Six-digit sign-in code"
              hint="Use the latest code sent to your email."
              placeholder="123456"
            />
            <NairaInput
              initialValue="12500"
              onAmountChange={setAmount}
              hint={
                amount === undefined
                  ? 'Enter an amount with up to two decimal places.'
                  : 'Amount entered. The full cost is shown before confirmation.'
              }
            />
            <Select label="Pickup location" defaultValue="ikeja">
              <option value="ikeja">Ikeja, Lagos</option>
              <option value="lekki">Lekki, Lagos · example</option>
            </Select>
            <Input
              label="Account name"
              value="Chiamaka Okafor"
              readOnly
              hint="Read-only account detail example."
            />
          </div>
        </DesignSection>
        <DesignSection
          number="04"
          title="Signals, prices and time"
          description="Every status uses words as well as colour. Timers accept a server-offset clock; disconnected cards never show a price as live."
        >
          <div className="agn-stack">
            <div className="agn-row">
              <Badge>Open box</Badge>
              <Badge tone="brand">Scheduled</Badge>
              <Badge tone="win">You're winning</Badge>
              <Badge tone="outbid">Outbid</Badge>
              <LivePill />
              <Countdown endsAt={now + 89000} serverNow={now} />
              <Countdown endsAt={now + 3600000} serverNow={now} />
              <Countdown endsAt={now - 1} serverNow={now} />
            </div>
            <div className="agn-row">
              <Price kobo={price} />
              <Button
                variant="secondary"
                onClick={() => setPrice((previous) => previous + 25000)}
              >
                Preview a price update
              </Button>
            </div>
          </div>
        </DesignSection>
        <DesignSection
          number="05"
          title="The lot card"
          description="Square photographs, readable condition, current price and time. These examples use the seeded photo-pending state; no stock photos are substituted."
        >
          <div className="agn-lot-grid">
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
                setToast('Philips steam iron added to the preview watchlist.')
              }
              onOpen={() => setDialog('sheet')}
              status="Outbid"
            />
            <LotCard
              title="Russell Hobbs kettle"
              reference="LOT-3RY6VPLP"
              condition="untested"
              priceKobo={350000}
              endsAt={now + 500000}
              serverNow={now}
              live={false}
              watched={false}
              onWatch={() => setToast('Kettle added to the preview watchlist.')}
              onOpen={() => setDialog('sheet')}
            />
            <LotCardSkeleton />
          </div>
        </DesignSection>
        <DesignSection
          number="06"
          title="The less certain moments"
          description="Empty, loading, error, offline and success states belong in the system from the start."
        >
          <div className="agn-stack">
            <OfflineBanner />
            <div className="agn-two-columns">
              <EmptyState
                title="Your watchlist is empty"
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setToast(
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
                onRetry={() => setToast('Preview retry completed.')}
              />
            </div>
            <Toast onClose={() => setToast('Message dismissed.')}>
              Your pickup details have been saved.
            </Toast>
            <Toast tone="error" onClose={() => setToast('Message dismissed.')}>
              Your request was not saved. Check your connection and try again.
            </Toast>
          </div>
        </DesignSection>
        <DesignSection
          number="07"
          title="Tabs, dialogs and bottom sheets"
          description="Keyboard navigation, trapped dialog focus, Escape to close and focus returned to the trigger."
        >
          <div className="agn-stack">
            <Tabs
              label="Bid status examples"
              value={tab}
              onChange={setTab}
              items={[
                {
                  value: 'winning',
                  label: 'Winning',
                  panel: 'You are leading on the Hisense microwave.',
                },
                {
                  value: 'outbid',
                  label: 'Outbid',
                  panel: 'Someone has placed a higher bid on the Philips iron.',
                },
                {
                  value: 'won',
                  label: 'Won',
                  panel: 'Paid lots and pickup details will appear here.',
                },
              ]}
            />
            <div className="agn-row">
              <Button variant="secondary" onClick={() => setDialog('dialog')}>
                Open dialog preview
              </Button>
              <Button variant="secondary" onClick={() => setDialog('sheet')}>
                Open bottom sheet preview
              </Button>
            </div>
          </div>
        </DesignSection>
      </main>
      <Footer>
        <p>
          Design review only. Sample amounts and statuses do not place bids or
          move money.
        </p>
      </Footer>
      <Dialog
        open={dialog !== undefined}
        presentation={dialog ?? 'dialog'}
        title="Ikeja pickup hub"
        onClose={() => setDialog(undefined)}
      >
        <p className="agn-dialog-copy">
          This is a component preview. Pickup opening hours and collection
          instructions will come from your warehouse settings.
        </p>
        <Button onClick={() => setDialog(undefined)}>
          Close pickup preview
        </Button>
      </Dialog>
      {toast && (
        <div className="agn-preview-feedback">
          <Toast onClose={() => setToast(undefined)}>{toast}</Toast>
        </div>
      )}
    </>
  );
}
