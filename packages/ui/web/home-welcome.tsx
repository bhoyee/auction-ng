import { ArrowRight, Heart, Gavel } from 'lucide-react';
export function HomeWelcome({ name }: { name?: string }) {
  return (
    <section
      className="agn-container agn-home-welcome"
      aria-label="Your auction homepage"
    >
      <div>
        <h1>Hello{name ? ', ' + name : ''}.</h1>
        <p>Find your next great deal.</p>
      </div>
      <nav aria-label="Your auction shortcuts">
        <a href="/watchlist">
          <Heart size={18} aria-hidden="true" />
          Your watchlist
          <ArrowRight size={16} aria-hidden="true" />
        </a>
        <a href="/my-bids">
          <Gavel size={18} aria-hidden="true" />
          Your bids
          <ArrowRight size={16} aria-hidden="true" />
        </a>
      </nav>
    </section>
  );
}
