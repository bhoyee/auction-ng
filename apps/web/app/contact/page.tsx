import { ContactPage } from '@auction-ng/ui/web/contact-page';
import { ContactChatAction } from '../../components/contact-chat-action';
import { publicLocations } from '../../lib/catalogue';
import { helpSupport } from '../../lib/help-content';
import { publicSupportEmail, whatsappContact } from '../../lib/support';

export const metadata = { title: 'Contact us | LotVanta' };

// "+2349094135585" -> "+234 909 413 5585" for display.
function displayPhone(number: string | undefined) {
  const value = number?.trim();
  const match = value && /^\+234(\d{3})(\d{3})(\d{4})$/.exec(value);
  return match ? `+234 ${match[1]} ${match[2]} ${match[3]}` : value;
}

export default async function Page() {
  const number = process.env.SUPPORT_WHATSAPP_NUMBER;
  const locations = await publicLocations().catch(() => ({ items: [] }));
  return (
    <ContactPage
      hours={`Open ${helpSupport.hours}`}
      replyPromise="We reply within 1 working day."
      chatAction={<ContactChatAction />}
      whatsappHref={whatsappContact(number)}
      whatsappLabel={displayPhone(number)}
      email={publicSupportEmail()}
      locations={locations.items.map(({ id, name, address }) => ({
        id,
        name,
        address,
      }))}
      quickLinks={[
        { href: '/help#forgot-password', label: 'I forgot my password' },
        { href: '/help#fund-wallet', label: 'Adding money to my wallet' },
        { href: '/help#fee-example', label: 'What fees do I pay?' },
        {
          href: '/help#collection-time',
          label: 'How long do I have to collect?',
        },
        { href: '/help#request-cancellation', label: 'Can I cancel a bid?' },
        { href: '/help#refunds', label: 'Do you give refunds?' },
      ]}
    />
  );
}
