import {
  Wallet,
  Gavel,
  MapPin,
  ShieldCheck,
  Banknote,
  PackageCheck,
  ArrowRight,
  BadgeCheck,
} from 'lucide-react';

const steps = [
  {
    title: 'Sign up & top up',
    text: 'Create your account, verify your email and fund your wallet by card or bank transfer.',
    icon: Wallet,
    detailIcon: Banknote,
    label: 'Your wallet',
    detail: 'Ready for your next bid',
    action: 'Create an account',
    href: '/sign-up',
  },
  {
    title: 'Bid & win',
    text: 'Check the condition notes and full cost. Choose your bid and follow the auction to the finish.',
    icon: Gavel,
    detailIcon: BadgeCheck,
    label: 'Your bid. Your choice.',
    detail: 'Full cost before you confirm',
    action: 'Explore auctions',
    href: '/deals',
  },
  {
    title: 'Pick up & repeat',
    text: 'Won your lot? Follow the pickup instructions and collect with your pickup pass. Then find your next favourite.',
    icon: PackageCheck,
    detailIcon: MapPin,
    label: 'Your pickup pass',
    detail: 'Collect at the listed warehouse',
    action: 'How pickup works',
    href: '/help',
  },
];

export function FirstVisitGuide({ demo }: { demo: boolean }) {
  return (
    <section
      className="agn-container agn-first-visit"
      aria-labelledby="home-how-it-works"
    >
      <h2 id="home-how-it-works">How Auction NG works</h2>
      <ol className="agn-first-visit-steps">
        {steps.map(
          (
            {
              title,
              text,
              icon: Icon,
              detailIcon: DetailIcon,
              label,
              detail,
              action,
              href,
            },
            index,
          ) => (
            <li className="agn-step-card" key={title}>
              <div className="agn-step-heading">
                <span
                  className="agn-step-number"
                  aria-label={`Step ${index + 1}`}
                >
                  {index + 1}
                </span>
                <h3>{title}</h3>
              </div>
              <p>{text}</p>
              <div className={`agn-step-panel agn-step-panel--${index + 1}`}>
                <Icon size={48} strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <strong>{label}</strong>
                  <span>
                    <DetailIcon size={16} aria-hidden="true" />
                    {detail}
                  </span>
                </div>
              </div>
              <a className="agn-step-action" href={href}>
                {action}
                <ArrowRight size={18} aria-hidden="true" />
              </a>
            </li>
          ),
        )}
      </ol>
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
