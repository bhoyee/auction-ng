import { useState } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { createBuyerClient } from '@auction-ng/api-client';
import { formatNaira } from '@auction-ng/shared';
import { Page, Private, Notice } from '../components/ui/page';
import { Body, Button } from '../components/ui/controls';
import { n } from '../components/ui/native-styles';
import { useLiveRead } from '../lib/live-read';
import { useSession } from '../lib/session';
import { apiUrl } from '../lib/config';
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { manager, session } = useSession();
  const router = useRouter();
  const [error, setError] = useState('');
  const read = useLiveRead(
    () => manager.run((c) => createBuyerClient(apiUrl, c).invoice(id)),
    [id, session?.user.id],
  );
  const item = read.data;
  async function pdf() {
    if (!item) return;
    try {
      const escape = (s: string) =>
        s.replace(
          /[&<>"']/g,
          (c) =>
            ({
              '&': '&amp;',
              '<': '&lt;',
              '>': '&gt;',
              '"': '&quot;',
              "'": '&#39;',
            })[c] ?? '',
        );
      const html = `<html><head><meta charset="utf-8"/><style>body{font-family:sans-serif;padding:32px;color:#151A30}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #E3E6EC}</style></head><body><h1>LotVanta</h1><h2>Invoice ${escape(item.number)}</h2><p>${escape(item.status)} - ${new Date(item.createdAt).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })}</p><table>${item.lines.map((line) => `<tr><td>${escape(line.lot.title)}<br/>${escape(line.lot.lotNumber)}</td><td>${escape(formatNaira(line.totalKobo))}</td></tr>`).join('')}</table><h2>Total ${escape(formatNaira(item.totalKobo))}</h2><p>Collection: ${escape(item.pickup?.location ?? 'See pickup instructions')}</p></body></html>`;
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Invoice ' + item.number,
      });
    } catch {
      setError('PDF could not be created. Retry.');
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
        {item && (
          <>
            <View style={n.surface}>
              <Body tone="brand">LotVanta</Body>
              <View style={n.between}>
                <Body tone="section">Invoice {item.number}</Body>
                <View style={item.status === 'paid' ? n.success : n.badge}>
                  <Body style={item.status === 'paid' ? n.white : undefined}>
                    {item.status}
                  </Body>
                </View>
              </View>
              <Body tone="secondary">
                {new Date(item.createdAt).toLocaleDateString('en-NG', {
                  timeZone: 'Africa/Lagos',
                })}{' '}
                - NGN
              </Body>
              <Body tone="secondary">
                {item.saleType === 'fixed_price'
                  ? 'Buy Now purchase'
                  : 'Auction win'}
              </Body>
              {item.lines.map((line) => (
                <View key={line.lot.id} style={n.between}>
                  <Body style={n.grow}>
                    {line.lot.title} - {line.lot.lotNumber}
                  </Body>
                  <Body style={n.bold}>{formatNaira(line.totalKobo)}</Body>
                </View>
              ))}
              <Body>Item subtotal: {formatNaira(item.hammerTotalKobo)}</Body>
              <Body>Service charge: {formatNaira(item.premiumKobo)}</Body>
              <Body>Lot fee: {formatNaira(item.lotFeeKobo)}</Body>
              <Body>Tax: {formatNaira(item.vatKobo)}</Body>
              <Body style={n.price}>{formatNaira(item.totalKobo)}</Body>
              <Body>
                Pickup: {item.pickup?.location ?? 'See collection instructions'}
              </Body>
            </View>
            <Button onPress={() => void pdf()}>Download or share PDF</Button>
            <Button onPress={() => router.push('/check-in')}>
              Open pickup pass
            </Button>
            <Button
              variant="secondary"
              onPress={() => router.replace('/orders')}
            >
              Back to awaiting pickup
            </Button>
          </>
        )}
      </Private>
    </Page>
  );
}
