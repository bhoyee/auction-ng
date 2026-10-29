import { PrivateGate } from '../../components/private-gate';
import { BuyerPage } from '@auction-ng/ui/web/buyer-page';
import {
  BuyerPanel,
  BuyerRow,
  BuyerLink,
  BuyerStack,
} from '@auction-ng/ui/web/buyer';
import { publicSupportEmail, whatsappContact } from '../../lib/support';
export default function Page() {
  const email = publicSupportEmail(),
    whatsapp = whatsappContact(process.env.SUPPORT_WHATSAPP_NUMBER);
  return (
    <PrivateGate title="Customer service">
      <BuyerPage
        title="Customer service"
        description="Help with your account, payment or collection."
      >
        <BuyerStack>
          <BuyerPanel>
            <h2>Talk to Auction NG</h2>
            <p>
              Include your item or invoice reference so we can help. Never share
              your password, verification code, BVN or full card details.
            </p>
            <BuyerRow>
              <BuyerLink href={`mailto:${email}`}>{email}</BuyerLink>
              {whatsapp && (
                <BuyerLink href={whatsapp}>Chat on WhatsApp</BuyerLink>
              )}
            </BuyerRow>
          </BuyerPanel>
          <BuyerPanel>
            <h2>Find an answer</h2>
            <BuyerRow>
              <BuyerLink href="/help">Help centre</BuyerLink>
              <BuyerLink href="/help#faqs">FAQs</BuyerLink>
              <BuyerLink href="/help#returns">
                Returns and collection policy
              </BuyerLink>
            </BuyerRow>
          </BuyerPanel>
        </BuyerStack>
      </BuyerPage>
    </PrivateGate>
  );
}
