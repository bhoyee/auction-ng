import {
  Wallet,
  Gavel,
  MapPin,
  ShieldCheck,
  Banknote,
  PackageCheck,
} from 'lucide-react';

export function FirstVisitGuide({ demo }: { demo: boolean }) {
  return (
    <section
      className="agn-container agn-first-visit"
      aria-label="How Auction NG works"
    >
      <div className="agn-first-visit-steps">
        {[
          { icon: Wallet, title: '1. Top up', text: 'Card or bank transfer' },
          {
            icon: Gavel,
            title: '2. Place your bid',
            text: 'Review the full cost first',
          },
          {
            icon: MapPin,
            title: '3. Collect your win',
            text: 'Your private pickup pass',
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title}>
            <Icon size={24} aria-hidden="true" />
            <span>
              <strong>{title}</strong>
              <small>{text}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="agn-first-visit-trust">
        <span>
          <ShieldCheck size={18} aria-hidden="true" />
          {demo ? 'Representative demo photos' : 'Actual item photos'}
        </span>
        <span>
          <Banknote size={18} aria-hidden="true" />
          Fees before you bid
        </span>
        <span>
          <PackageCheck size={18} aria-hidden="true" />
          Condition notes on every lot
        </span>
      </div>
    </section>
  );
}
