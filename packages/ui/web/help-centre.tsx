'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Ban,
  ChevronDown,
  Gavel,
  Mail,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Tags,
  Trophy,
  Truck,
  Wallet,
} from 'lucide-react';

type Block =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; rows: [string, string][]; total?: [string, string] };
export type HelpCentreTopic = {
  id: string;
  title: string;
  summary: string;
  icon: keyof typeof icons;
  questions: { id: string; question: string; answer: Block[] }[];
};

const icons = {
  account: ShieldCheck,
  wallet: Wallet,
  bidding: Gavel,
  'buy-now': Trophy,
  fees: ReceiptText,
  pickup: PackageCheck,
  cancel: Ban,
  returns: RotateCcw,
  delivery: Truck,
  items: Tags,
};

const blockText = (block: Block) =>
  block.kind === 'text'
    ? block.text
    : block.kind === 'table'
      ? [...block.rows, ...(block.total ? [block.total] : [])].flat().join(' ')
      : block.items.join(' ');

function Answer({ blocks }: { blocks: Block[] }) {
  return (
    <div className="agn-help-answer">
      {blocks.map((block, index) =>
        block.kind === 'text' ? (
          <p key={index}>{block.text}</p>
        ) : block.kind === 'steps' ? (
          <ol key={index}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : block.kind === 'list' ? (
          <ul key={index}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <table key={index}>
            <tbody>
              {block.rows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
            {block.total && (
              <tfoot>
                <tr>
                  <th scope="row">{block.total[0]}</th>
                  <td>{block.total[1]}</td>
                </tr>
              </tfoot>
            )}
          </table>
        ),
      )}
    </div>
  );
}

export function HelpCentre({
  topics,
  contact,
}: {
  topics: HelpCentreTopic[];
  contact: {
    hours: string;
    prepare: string;
    whatsappHref?: string;
    email?: string;
  };
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(topics[0]?.id ?? '');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const term = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      topics
        .map((topic) => ({
          ...topic,
          questions: term
            ? topic.questions.filter((question) =>
                [question.question, ...question.answer.map(blockText)]
                  .join(' ')
                  .toLowerCase()
                  .includes(term),
              )
            : topic.questions,
        }))
        .filter((topic) => topic.questions.length),
    [topics, term],
  );
  const matches = visible.reduce(
    (count, topic) => count + topic.questions.length,
    0,
  );

  // Open the question named in the address (e.g. /help#forgot-password).
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      if (topics.some((topic) => topic.questions.some((q) => q.id === id)))
        setOpen((current) => new Set(current).add(id));
      requestAnimationFrame(() =>
        document.getElementById(id)?.scrollIntoView({ block: 'start' }),
      );
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [topics]);

  // Highlight the topic being read in the side menu.
  useEffect(() => {
    const sections = topics
      .map((topic) => document.getElementById(topic.id))
      .filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver(
      (entries) => {
        const shown = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (shown[0]) setActive(shown[0].target.id);
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [topics, visible]);

  const toggle = (id: string, next: boolean) =>
    setOpen((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });

  let contactLinks: ReactNode = null;
  if (contact.whatsappHref || contact.email)
    contactLinks = (
      <div className="agn-help-contact-actions">
        {contact.whatsappHref && (
          <a
            className="agn-button agn-button--primary"
            href={contact.whatsappHref}
          >
            <MessageCircle size={18} aria-hidden="true" />
            Chat on WhatsApp
          </a>
        )}
        {contact.email && (
          <a
            className="agn-button agn-button--secondary"
            href={`mailto:${contact.email}`}
          >
            <Mail size={18} aria-hidden="true" />
            {contact.email}
          </a>
        )}
      </div>
    );

  return (
    <main className="agn-help">
      <section className="agn-help-hero">
        <div className="agn-container">
          <h1>How can we help?</h1>
          <p>
            Answers about your account, wallet, bidding, fees and collecting
            your wins.
          </p>
          <label className="agn-help-search">
            <Search size={20} aria-hidden="true" />
            <span className="agn-sr-only">Search help articles</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search, e.g. forgot password, fees, pickup"
              maxLength={80}
            />
          </label>
          {term && (
            <p className="agn-help-results" role="status">
              {matches
                ? `${matches} ${matches === 1 ? 'answer' : 'answers'} found`
                : 'No answers found'}
            </p>
          )}
          {!term && (
            <nav className="agn-help-topics" aria-label="Help topics">
              {topics.map((topic) => {
                const Icon = icons[topic.icon];
                return (
                  <a
                    key={topic.id}
                    href={`#${topic.id}`}
                    className="agn-help-topic"
                  >
                    <Icon size={24} aria-hidden="true" />
                    <strong>{topic.title}</strong>
                    <span>{topic.summary}</span>
                  </a>
                );
              })}
            </nav>
          )}
        </div>
      </section>

      <div className="agn-container agn-help-body" id="faqs">
        <nav className="agn-help-sidenav" aria-label="Help sections">
          <ul>
            {visible.map((topic) => (
              <li key={topic.id}>
                <a
                  href={`#${topic.id}`}
                  aria-current={active === topic.id ? 'true' : undefined}
                >
                  {topic.title}
                </a>
              </li>
            ))}
            <li>
              <a href="#contact">Contact us</a>
            </li>
          </ul>
        </nav>
        <div className="agn-help-articles">
          {visible.length === 0 && (
            <div className="agn-help-empty">
              <h2>No answers match “{query.trim()}”</h2>
              <p>Try another word, or contact our team and we will help.</p>
              <a href="#contact">Contact us</a>
            </div>
          )}
          {visible.map((topic) => {
            const Icon = icons[topic.icon];
            return (
              <section
                key={topic.id}
                id={topic.id}
                className="agn-help-topic-section"
              >
                <header>
                  <Icon size={26} aria-hidden="true" />
                  <h2>{topic.title}</h2>
                </header>
                {topic.questions.map((question) => (
                  <details
                    key={question.id}
                    id={question.id}
                    className="agn-help-question"
                    open={Boolean(term) || open.has(question.id)}
                    onToggle={(event) =>
                      !term && toggle(question.id, event.currentTarget.open)
                    }
                  >
                    <summary>
                      {question.question}
                      <ChevronDown size={20} aria-hidden="true" />
                    </summary>
                    <Answer blocks={question.answer} />
                  </details>
                ))}
              </section>
            );
          })}
        </div>
      </div>

      <section className="agn-help-contact" id="contact">
        <div className="agn-container">
          <div>
            <h2>Still need help?</h2>
            <p>
              Our team is available {contact.hours}. {contact.prepare}
            </p>
          </div>
          {contactLinks ?? (
            <p>
              Support contact details will be published before real auctions
              launch.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
