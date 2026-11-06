import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { createBuyerClient } from '@auction-ng/api-client';
import { formatNaira } from '@auction-ng/shared';
import { Page, Private, Notice, Loading } from '../components/ui/page';
import { Body, Button } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { invoiceStyles as s } from '../components/ui/invoice-styles';
import { useLiveRead } from '../lib/live-read';
import { useSession } from '../lib/session';
import { apiUrl } from '../lib/config';
import { invoiceDocument, invoiceSummary } from '../lib/invoice-document';
import logo from '../assets/lotvanta-logo.png';

export default function InvoiceScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const { manager, session } = useSession();
  const router = useRouter();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const read = useLiveRead(
    () => manager.run((c) => createBuyerClient(apiUrl, c).invoice(id)),
    [id, session?.user.id],
  );
  const item = read.data;
  async function exportInvoice(print = false) {
    if (!item || exporting) return;
    setExporting(true);
    setError('');
    try {
      const html = invoiceDocument(item, session?.user.name ?? 'Buyer');
      if (print) await Print.printAsync({ html });
      else {
        const file = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(file.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Invoice ' + item.number,
          });
        else await Print.printAsync({ uri: file.uri });
      }
    } catch {
      setError('Your invoice could not be exported. Please try again.');
    } finally {
      setExporting(false);
    }
  }
  return (
    <Page title="Invoice">
      <Private>
        <Notice
          message={error || read.error}
          onClose={() => {
            setError('');
            read.refresh();
          }}
        />
        {!item && !read.error && <Loading />}
        {item && (
          <>
            <View style={s.actions}>
              <View style={s.action}>
                <Button
                  fullWidth
                  busy={exporting}
                  onPress={() => void exportInvoice()}
                >
                  Save / share PDF
                </Button>
              </View>
              <View style={s.action}>
                <Button
                  fullWidth
                  variant="secondary"
                  busy={exporting}
                  onPress={() => void exportInvoice(true)}
                >
                  Print invoice
                </Button>
              </View>
            </View>
            <View style={n.surface}>
              <View style={s.header}>
                <Image
                  source={logo}
                  style={s.logo}
                  contentFit="contain"
                  accessibilityLabel="LotVanta"
                />
                <View
                  style={[
                    s.badge,
                    item.status === 'paid'
                      ? s.paid
                      : item.status === 'cancelled'
                        ? s.cancelled
                        : item.status === 'refunded'
                          ? s.refunded
                          : undefined,
                  ]}
                >
                  <Body
                    style={[s.badgeText, item.status !== 'pending' && s.white]}
                  >
                    {item.status[0]?.toUpperCase() + item.status.slice(1)}
                  </Body>
                </View>
              </View>
              <Body tone="fine">Invoice number</Body>
              <Body style={s.number} numberOfLines={1} adjustsFontSizeToFit>
                {item.number}
              </Body>
              <View style={s.metadata}>
                <View style={s.row}>
                  <Body style={s.label}>Invoice date</Body>
                  <Body style={s.value}>
                    {new Date(item.createdAt).toLocaleDateString('en-NG', {
                      timeZone: 'Africa/Lagos',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Body>
                </View>
                <View style={s.row}>
                  <Body style={s.label}>Order type</Body>
                  <Body style={s.value}>
                    {item.saleType === 'fixed_price'
                      ? 'Buy Now purchase'
                      : 'Auction win'}
                  </Body>
                </View>
                <View style={s.row}>
                  <Body style={s.label}>Currency</Body>
                  <Body style={s.value}>NGN</Body>
                </View>
              </View>
              <Body tone="fine">Billed to</Body>
              <Body style={s.title}>{session?.user.name}</Body>
            </View>
            <View style={n.surface}>
              <Body style={s.title}>Items on this invoice</Body>
              {item.lines.map((line) => (
                <View key={line.lot.id} style={s.line}>
                  <Body style={s.title}>{line.lot.title}</Body>
                  <Body tone="fine">Item {line.lot.lotNumber}</Body>
                  {line.storage && (
                    <Body tone="fine">
                      Collect by{' '}
                      {new Date(line.storage.dueAt).toLocaleString('en-NG', {
                        timeZone: 'Africa/Lagos',
                      })}{' '}
                      WAT.{' '}
                      {line.storage.waived
                        ? 'Storage waived'
                        : `${formatNaira(line.storage.dailyKobo)} per overdue working day; ${formatNaira(line.storage.capKobo)} cap`}
                      . Storage outstanding:{' '}
                      {formatNaira(line.storage.outstandingKobo)} (separate).
                    </Body>
                  )}
                  <View style={s.row}>
                    <Body style={s.label}>Line total</Body>
                    <Body style={s.value}>{formatNaira(line.totalKobo)}</Body>
                  </View>
                </View>
              ))}
            </View>
            <View style={n.surface}>
              <Body style={s.title}>Invoice summary</Body>
              {invoiceSummary(item).map((row) => (
                <View key={row.label} style={s.row}>
                  <Body style={s.label}>{row.label}</Body>
                  <Body style={s.value}>{formatNaira(row.amount)}</Body>
                </View>
              ))}
              <View style={s.total}>
                <Body style={s.white}>
                  {item.status === 'paid' ? 'Total paid' : 'Invoice total'}
                </Body>
                <Body
                  style={s.totalAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {formatNaira(item.totalKobo)}
                </Body>
              </View>
            </View>
            <View style={n.surface}>
              <Body style={s.title}>Pickup location</Body>
              <Body tone="secondary">
                {item.pickup?.location ??
                  'Collection details will appear here when available.'}
              </Body>
              {item.status === 'paid' && (
                <Button
                  fullWidth
                  variant="success"
                  onPress={() => router.push('/check-in')}
                >
                  View collection options
                </Button>
              )}
            </View>
            <Button
              fullWidth
              onPress={() =>
                router.replace(from === 'purchases' ? '/purchases' : '/orders')
              }
            >
              {from === 'purchases'
                ? 'Back to purchase history'
                : 'Back to awaiting pickup'}
            </Button>
          </>
        )}
      </Private>
    </Page>
  );
}
