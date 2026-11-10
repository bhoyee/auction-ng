import type { ReactNode } from 'react';
import {
  ArrowRight,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';

export type ContactLocation = { id: string; name: string; address?: string };

// Contact us: ways to reach the team, pickup centres and quick help links.
export function ContactPage({
  hours,
  replyPromise,
  chatAction,
  whatsappHref,
  whatsappLabel,
  email,
  locations,
  quickLinks,
}: {
  hours: string;
  replyPromise: string;
  chatAction: ReactNode;
  whatsappHref?: string;
  whatsappLabel?: string;
  email?: string;
  locations: ContactLocation[];
  quickLinks: { href: string; label: string }[];
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
        <section aria-labelledby="contact-ways">
          <h2 id="contact-ways">Ways to reach us</h2>
          <div className="agn-contact-cards">
            <article className="agn-contact-card">
              <MessagesSquare size={28} aria-hidden="true" />
              <h3>Chat with support</h3>
              <p>
                Message our team from your account. Your conversation stays in
                Customer service so you can follow up any time.
              </p>
              {chatAction}
            </article>
            {whatsappHref && (
              <article className="agn-contact-card">
                <MessageCircle size={28} aria-hidden="true" />
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
                  className="agn-button agn-button--primary"
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chat on WhatsApp
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </article>
            )}
            {email && (
              <article className="agn-contact-card">
                <Mail size={28} aria-hidden="true" />
                <h3>Email</h3>
                <p>
                  Write to us at {email}. {replyPromise}
                </p>
                <a
                  className="agn-button agn-button--secondary"
                  href={`mailto:${email}`}
                >
                  Send an email
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </article>
            )}
          </div>
        </section>

        {locations.length > 0 && (
          <section aria-labelledby="contact-centres">
            <h2 id="contact-centres">Pickup centres</h2>
            <p className="agn-contact-lead">
              Collect your wins here with your QR pickup pass.
            </p>
            <div className="agn-contact-locations">
              {locations.map((location) => (
                <article key={location.id} className="agn-contact-location">
                  <MapPin size={22} aria-hidden="true" />
                  <div>
                    <h3>{location.name}</h3>
                    {location.address && <p>{location.address}</p>}
                    {location.address && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Get directions
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="contact-quick" className="agn-contact-quick">
          <h2 id="contact-quick">Before you write, these might help</h2>
          <ul>
            {quickLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href}>
                  {link.label}
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <p className="agn-contact-safety">
          <ShieldCheck size={20} aria-hidden="true" />
          We will never ask for your password, sign-in code, authenticator code
          or pickup QR code. Have your item ID or invoice reference ready when
          you contact us.
        </p>
      </div>
    </main>
  );
}
