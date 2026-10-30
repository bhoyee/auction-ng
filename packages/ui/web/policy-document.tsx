import { CookieSettingsButton } from './cookie-settings-button';

export type PolicySection = { title: string; text: string };
export function PolicyDocument({
  title,
  introduction,
  sections,
  supportEmail,
}: {
  title: string;
  introduction: string;
  sections: readonly PolicySection[];
  supportEmail: string;
}) {
  return (
    <main className="agn-container agn-policy-page">
      <header>
        <a href="/">Auction NG</a>
        <span>Policies & your information</span>
        <h1>{title}</h1>
        <p>{introduction}</p>
        <small>Review draft · Updated 28 October 2026</small>
      </header>
      <div className="agn-policy-review" role="note">
        This draft describes the current marketplace. The registered operator’s
        name, business address and final legal terms still need confirmation
        before production publication.
      </div>
      <div className="agn-policy-layout">
        <nav aria-label="On this page">
          <strong>On this page</strong>
          {sections.map((section, index) => (
            <a key={section.title} href={`#policy-section-${index + 1}`}>
              {section.title}
            </a>
          ))}
        </nav>
        <article>
          {sections.map((section, index) => (
            <section id={`policy-section-${index + 1}`} key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </section>
          ))}
          <section>
            <h2>Contact us</h2>
            <p>
              For questions about this policy, contact{' '}
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.
            </p>
          </section>
          <nav aria-label="Other policies">
            <a href="/terms-of-use">Terms of Use</a>
            <a href="/privacy-policy">Privacy Policy</a>
            <a href="/cookie-policy">Cookie Policy</a>
          </nav>
          <CookieSettingsButton />
        </article>
      </div>
    </main>
  );
}
