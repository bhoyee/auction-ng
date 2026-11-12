import type { ReactNode } from 'react';
import {
  ArrowRight,
  Clock3,
  Mail,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';

// Contact us: the message form on one side, quicker channels on the other.
export function ContactPage({
  hours,
  replyPromise,
  form,
  chatAction,
  whatsappHref,
  whatsappLabel,
  email,
}: {
  hours: string;
  replyPromise: string;
  form: ReactNode;
  chatAction: ReactNode;
  whatsappHref?: string;
  whatsappLabel?: string;
  email?: string;
}) {
  return (
    <main className="agn-contact">
      <section className="agn-contact-hero">
        <div className="agn-container">
          <h1>Contact us</h1>
          <p>
            We are here to help with your account, payments, bids and
            collections.
          </p>
          <p className="agn-contact-hours">
            <Clock3 size={18} aria-hidden="true" />
            {hours}
          </p>
        </div>
      </section>

      <div className="agn-container agn-contact-body">
        <section
          className="agn-contact-panel agn-contact-form-panel"
          aria-labelledby="contact-form-title"
        >
          <h2 id="contact-form-title">Send us a message</h2>
          <p className="agn-contact-lead">
            {replyPromise} We will email you a reference number straight away.
          </p>
          {form}
        </section>

        <aside className="agn-contact-side" aria-labelledby="contact-ways">
          <h2 id="contact-ways">Other ways to reach us</h2>
          <article className="agn-contact-card">
            <span className="agn-contact-icon">
              <MessagesSquare size={22} aria-hidden="true" />
            </span>
            <div>
              <h3>Chat with support</h3>
              <p>
                Message our team from your account and follow up any time in
                Customer service.
              </p>
              {chatAction}
            </div>
          </article>
          {whatsappHref && (
            <article className="agn-contact-card">
              <span className="agn-contact-icon">
                <MessageCircle size={22} aria-hidden="true" />
              </span>
              <div>
                <h3>WhatsApp</h3>
                <p>
                  Chat with us on WhatsApp
                  {whatsappLabel && (
                    <>
                      {' at '}
                      <span className="agn-contact-nowrap">
                        {whatsappLabel}
                      </span>
                    </>
                  )}
                  .
                </p>
                <a
                  className="agn-button agn-button--success"
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chat on WhatsApp
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
            </article>
          )}
          {email && (
            <article className="agn-contact-card">
              <span className="agn-contact-icon">
                <Mail size={22} aria-hidden="true" />
              </span>
              <div>
                <h3>Email</h3>
                <p>
                  Write to us at{' '}
                  <span className="agn-contact-nowrap">{email}</span>.
                </p>
                <a
                  className="agn-button agn-contact-email-button"
                  href={`mailto:${email}`}
                >
                  Send an email
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </div>
            </article>
          )}
          <p className="agn-contact-safety">
            <ShieldCheck size={20} aria-hidden="true" />
            We will never ask for your password, sign-in code, authenticator
            code or pickup QR code.
          </p>
        </aside>
      </div>
    </main>
  );
}
