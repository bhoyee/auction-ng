import { ContactPage } from '@auction-ng/ui/web/contact-page';
import { ContactChatAction } from '../../components/contact-chat-action';
import { ContactForm } from '../../components/contact-form';
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
  return (
    <ContactPage
      hours={`Open ${helpSupport.hours}`}
      replyPromise="We reply within 1 working day."
      form={<ContactForm />}
      chatAction={<ContactChatAction />}
      whatsappHref={whatsappContact(number)}
      whatsappLabel={displayPhone(number)}
      email={publicSupportEmail()}
    />
  );
}
