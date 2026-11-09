import { Page } from '../components/ui/page';
import { Body, Button } from '../components/ui/controls';
import { useRouter } from 'expo-router';
export default function Shipments() {
  const router = useRouter();
  return (
    <Page title="Shipments">
      <Body tone="section">Warehouse pickup is available.</Body>
      <Body>
        Delivery is not available yet. Your paid orders and collection
        instructions are in Awaiting pickup.
      </Body>
      <Button onPress={() => router.push('/orders')}>Awaiting pickup</Button>
    </Page>
  );
}
