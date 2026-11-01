'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  MessageCircle,
  Headphones,
  Send,
  Paperclip,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  supportFaqs,
  supportTopics,
  supportRules,
  type SupportConversation,
  type SupportMessage,
  type SupportCreate,
  type SupportMessageInput,
  type SupportAction,
  type SupportListInput,
} from '@auction-ng/shared/support-schemas';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Select } from './select';
import { Dialog } from './dialog';
import { Toast } from './toast';
import { BuyerStack } from './buyer';
type Page<T> = { items: T[]; nextCursor: string | null };
export type SupportClient = {
  list(input: SupportListInput): Promise<Page<SupportConversation>>;
  get(id: string): Promise<SupportConversation>;
  create(
    input: SupportCreate & { buyerEmail?: string },
  ): Promise<SupportConversation>;
  messages(id: string, cursor?: string): Promise<Page<SupportMessage>>;
  send(id: string, input: SupportMessageInput): Promise<SupportConversation>;
  action(id: string, input: SupportAction): Promise<SupportConversation>;
  availability(): Promise<{ available: boolean; attachmentsEnabled?: boolean }>;
  presence(value: boolean): Promise<{ available: boolean }>;
  attachment(id: string): Promise<Blob>;
};
const statusName = {
  open: 'Open',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};
const date = (value: string) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
async function compress(
  file: File,
): Promise<{ mime: 'image/jpeg'; data: string }> {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 8000000
  )
    throw Error('Choose a JPEG, PNG or WebP image smaller than 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw Error('Image processing unavailable');
    context.fillStyle = 'white';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.6, 0.4]) {
      const data = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      if (data && data.length <= 390000) return { mime: 'image/jpeg', data };
    }
    throw Error('This image is too detailed. Crop it and try again.');
  } finally {
    bitmap.close();
  }
}
function PrivateImage({ id, client }: { id: string; client: SupportClient }) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(false);
  useEffect(() => {
    let active = true,
      source = '';
    void client
      .attachment(id)
      .then((blob) => {
        source = URL.createObjectURL(blob);
        if (active) setUrl(source);
        else URL.revokeObjectURL(source);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (source) URL.revokeObjectURL(source);
    };
  }, [id, client]);
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="agn-support-attachment"
    >
      <img
        src={url}
        alt="Conversation attachment. Open full image."
        loading="lazy"
      />
    </a>
  ) : (
    <span>
      {error
        ? 'Image unavailable. Reopen this conversation to retry.'
        : 'Loading image…'}
    </span>
  );
}
function CreateConversation({
  open,
  popup,
  title,
  onClose,
  children,
}: {
  open: boolean;
  popup: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!popup)
    return (
      <Dialog open={open} title={title} onClose={onClose}>
        {children}
      </Dialog>
    );
  if (!open) return null;
  return (
    <section className="agn-support-quick-create">
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft size={18} /> Back to conversations
      </Button>
      <h3>How can we help?</h3>
      {children}
    </section>
  );
}
export function SupportWorkspace({
  client,
  connect,
  staff = false,
  initialId = '',
  presentation = 'desk',
  onOpenConversation,
  startNew = false,
}: {
  client: SupportClient;
  connect: (
    change: (id: string) => void,
    status: (connected: boolean) => void,
  ) => () => void;
  staff?: boolean;
  initialId?: string;
  presentation?: 'desk' | 'popup' | 'history';
  onOpenConversation?: (id?: string) => void;
  startNew?: boolean;
}) {
  const [filter, setFilter] = useState('all'),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState<Page<SupportConversation>>(),
    [selected, setSelected] = useState(initialId),
    [conversation, setConversation] = useState<SupportConversation>();
  const [messages, setMessages] = useState<SupportMessage[]>([]),
    [older, setOlder] = useState<string | null>(null),
    [olderPage, setOlderPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [live, setLive] = useState(false),
    [available, setAvailable] = useState(false),
    [imagesEnabled, setImagesEnabled] = useState(false),
    [accepting, setAccepting] = useState(false),
    [version, setVersion] = useState(0);
  const [createOpen, setCreateOpen] = useState(startNew),
    [subject, setSubject] = useState(''),
    [topic, setTopic] = useState('other'),
    [reference, setReference] = useState(''),
    [buyerEmail, setBuyerEmail] = useState(''),
    [intro, setIntro] = useState(''),
    [human, setHuman] = useState(false);
  const [draft, setDraft] = useState(''),
    [internalDraft, setInternalDraft] = useState(''),
    [internal, setInternal] = useState(false),
    [images, setImages] = useState<{ mime: 'image/jpeg'; data: string }[]>([]),
    [imageBusy, setImageBusy] = useState(false);
  const pending = useRef<{
    run: () => Promise<SupportConversation>;
    success: (row: SupportConversation) => void;
  } | null>(null);
  const imageGeneration = useRef(0);
  const messageBox = useRef<HTMLDivElement>(null),
    atBottom = useRef(true);
  useEffect(() => {
    if (!olderPage && atBottom.current && messageBox.current)
      messageBox.current.scrollTop = messageBox.current.scrollHeight;
  }, [messages.at(-1)?.id, olderPage]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    if (presentation !== 'popup' || !notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice, presentation]);
  useEffect(() => connect(() => reload(), setLive), [connect, reload]);
  useEffect(() => {
    setPage(undefined);
  }, [filter, pages]);
  useEffect(() => {
    atBottom.current = true;
    imageGeneration.current++;
    setImageBusy(false);
    setConversation(undefined);
    setMessages([]);
    setOlderPage(null);
    setOlder(null);
    setDraft('');
    setInternalDraft('');
    setImages([]);
    setInternal(false);
  }, [selected]);
  useEffect(() => {
    let active = true,
      running = false;
    const refresh = async () => {
      if (running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const [list, availability, detail, chat] = await Promise.all([
          client.list({
            status: filter as 'all' | 'open' | 'in_progress' | 'resolved',
            cursor: pages.at(-1),
            limit: 10,
          }),
          client.availability(),
          selected ? client.get(selected) : Promise.resolve(undefined),
          selected
            ? client.messages(selected, olderPage ?? undefined)
            : Promise.resolve(undefined),
        ]);
        if (!active) return;
        setPage(list);
        setAvailable(availability.available);
        setImagesEnabled(availability.attachmentsEnabled === true);
        setError((previous) =>
          previous.startsWith('Conversations could not be refreshed.')
            ? ''
            : previous,
        );
        setConversation(detail);
        if (chat) {
          setMessages(chat.items);
          setOlder(chat.nextCursor);
        }
      } catch (cause) {
        if (active) {
          const status =
            cause && typeof cause === 'object' && 'status' in cause
              ? cause.status
              : undefined;
          if ([401, 403, 404].includes(Number(status))) {
            setConversation(undefined);
            setMessages([]);
            setPage(undefined);
          }
          setError(
            'Conversations could not be refreshed. Check your connection and retry. Last confirmed messages are kept where access allows.',
          );
        }
      } finally {
        running = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), selected ? 5000 : 15000);
    const resume = () => void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
    };
  }, [client, filter, pages, selected, olderPage, version]);
  useEffect(() => {
    if (!staff || !accepting) return;
    let active = true;
    const heartbeat = () => {
      if (document.hidden || !navigator.onLine) return;
      void client.presence(true).catch(() => {
        if (active) {
          setAccepting(false);
          setError(
            'Your availability could not be confirmed. Reconnect and enable it again.',
          );
        }
      });
    };
    heartbeat();
    const timer = setInterval(heartbeat, 20000);
    return () => {
      active = false;
      clearInterval(timer);
      void client.presence(false).catch(() => {});
    };
  }, [client, staff, accepting]);
  const locked = busy || uncertain;
  async function execute(operation: NonNullable<typeof pending.current>) {
    if (busy) return;
    pending.current = operation;
    setBusy(true);
    setError('');
    try {
      const row = await operation.run();
      if (alive.current) {
        pending.current = null;
        setUncertain(false);
        operation.success(row);
        reload();
      }
    } catch (cause) {
      if (!alive.current) return;
      const status =
        cause && typeof cause === 'object' && 'status' in cause
          ? Number(cause.status)
          : 0;
      const retrySame =
        uncertain || ![400, 401, 403, 404, 409, 413, 422, 429].includes(status);
      setUncertain(retrySame);
      if (!retrySame) pending.current = null;
      setError(
        status === 409
          ? 'This conversation changed or another agent is handling it. Review the latest messages and try again.'
          : status === 429
            ? 'Too many requests. Wait a moment before trying again.'
            : status === 400 || status === 413
              ? 'Check the details and image size. Use JPEG, PNG or WebP screenshots only.'
              : retrySame
                ? 'We could not confirm this request. Retry the same request below; your message will not be sent twice.'
                : 'The request could not be completed. Check your account permissions and connection, then retry.',
      );
      reload();
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function act(action: SupportAction['action']) {
    if (!conversation || locked) return;
    const id = conversation.id,
      input = {
        action,
        expectedVersion: conversation.version,
        idempotencyKey: crypto.randomUUID(),
      };
    void execute({
      run: () => client.action(id, input),
      success: (row) => {
        if (selectedRef.current === id) setConversation(row);
        setNotice(
          action === 'handoff'
            ? 'Your conversation is with our support team. You can leave a message while you wait.'
            : 'Conversation updated.',
        );
      },
    });
  }
  function send(faqId?: SupportMessageInput['faqId']) {
    if (!conversation || locked || imageBusy) return;
    const id = conversation.id;
    const input: SupportMessageInput = {
      text: faqId ? '' : staff && internal ? internalDraft : draft,
      ...(faqId ? { faqId } : {}),
      images: faqId ? [] : images,
      internal: staff && internal,
      idempotencyKey: crypto.randomUUID(),
    };
    void execute({
      run: () => client.send(id, input),
      success: (row) => {
        if (selectedRef.current === id) {
          setConversation(row);
          if (!faqId) {
            if (internal) setInternalDraft('');
            else setDraft('');
            setImages([]);
          }
          setOlderPage(null);
        }
      },
    });
  }
  return (
    <section
      className={`agn-support-workspace agn-support-workspace--${presentation}${createOpen ? ' agn-support-workspace--creating' : ''}`}
      aria-label={staff ? 'Staff support desk' : 'Support conversations'}
    >
      <header className="agn-support-toolbar">
        <div>
          <h2>{staff ? 'Support desk' : 'Your conversations'}</h2>
          <p>
            {staff
              ? 'One inbox for buyer questions, handoffs and follow-ups.'
              : 'Get an answer, speak to our team and pick up where you left off.'}
          </p>
        </div>
        <Button
          onClick={() =>
            onOpenConversation ? onOpenConversation() : setCreateOpen(true)
          }
          disabled={locked}
        >
          <MessageCircle size={18} aria-hidden="true" />
          {staff ? 'Open for a buyer' : 'Start a conversation'}
        </Button>
      </header>
      <div className="agn-support-availability">
        <Headphones size={18} aria-hidden="true" />
        <span>
          {available
            ? 'Our team is accepting conversations'
            : 'Leave a message for our team. We will notify you when someone replies.'}
        </span>
        {staff && (
          <label>
            <input
              type="checkbox"
              checked={accepting}
              onChange={(event) => setAccepting(event.target.checked)}
            />
            Accept live conversations
          </label>
        )}
      </div>
      {error && (
        <div>
          <Toast tone="error" emphasis onClose={() => setError('')}>
            {error}
          </Toast>
          <Button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={reload}
          >
            Retry loading conversations
          </Button>
        </div>
      )}
      {notice && (
        <Toast tone="success" emphasis onClose={() => setNotice('')}>
          {notice}
        </Toast>
      )}
      {uncertain && (
        <Button
          busy={busy}
          onClick={() => {
            if (pending.current) void execute(pending.current);
          }}
        >
          Retry the same request
        </Button>
      )}
      <div
        className={`agn-support-columns${selected ? ' agn-support-columns--selected' : ''}`}
      >
        <aside className="agn-support-inbox" aria-label="Conversation inbox">
          <div
            className="agn-support-tabs"
            role="group"
            aria-label="Filter conversations"
          >
            {(['all', 'open', 'in_progress', 'resolved'] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={filter === tab}
                  disabled={locked}
                  onClick={() => {
                    setFilter(tab);
                    setPages([undefined]);
                  }}
                >
                  {tab === 'all' ? 'All' : statusName[tab]}
                </button>
              ),
            )}
          </div>
          {loading && !page ? (
            <p role="status">Loading conversations…</p>
          ) : !page ? (
            <Button variant="secondary" onClick={reload}>
              Retry loading conversations
            </Button>
          ) : !page.items.length ? (
            <div className="agn-support-empty">
              <MessageCircle size={32} aria-hidden="true" />
              <strong>No conversations here yet</strong>
              <p>
                {filter === 'all'
                  ? 'Start a conversation when you need a hand.'
                  : 'Conversations with this status will appear here.'}
              </p>
            </div>
          ) : (
            <div className="agn-support-rows">
              {page.items.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={row.id === selected ? 'is-selected' : ''}
                  aria-pressed={row.id === selected}
                  disabled={locked}
                  onClick={() => {
                    if (onOpenConversation) {
                      onOpenConversation(row.id);
                      return;
                    }
                    setSelected(row.id);
                    setError('');
                  }}
                >
                  <span className="agn-support-row-top">
                    <strong>{row.subject}</strong>
                    <span
                      className={`agn-support-status agn-support-status--${row.status}`}
                    >
                      {statusName[row.status]}
                    </span>
                  </span>
                  <span>
                    {row.number}
                    {staff ? ` · ${row.buyerName}` : ''}
                  </span>
                  <span className="agn-support-row-meta">
                    {row.mode === 'assistant'
                      ? 'Guided assistant'
                      : (row.assigneeName ?? 'Waiting for our team')}
                    <time dateTime={row.updatedAt}>
                      {date(row.updatedAt)} WAT
                    </time>
                  </span>
                </button>
              ))}
            </div>
          )}
          <nav
            className="agn-support-pagination"
            aria-label="Conversation pages"
          >
            <Button
              variant="secondary"
              size="small"
              disabled={pages.length < 2 || locked}
              onClick={() => setPages((value) => value.slice(0, -1))}
            >
              Previous
            </Button>
            <span>Page {pages.length}</span>
            <Button
              variant="secondary"
              size="small"
              disabled={!page?.nextCursor || locked}
              onClick={() => {
                if (page?.nextCursor)
                  setPages((value) => [...value, page.nextCursor ?? undefined]);
              }}
            >
              Next
            </Button>
          </nav>
        </aside>
        <section
          className="agn-support-chat"
          aria-label="Conversation messages"
        >
          {!selected ? (
            <div className="agn-support-empty agn-support-welcome">
              <Headphones size={40} aria-hidden="true" />
              <h3>How can we help?</h3>
              <p>
                Choose a conversation or start a new one. Your messages stay
                together when our team takes over.
              </p>
              <span>
                <ShieldCheck size={18} aria-hidden="true" />
                Private support, linked to your account
              </span>
            </div>
          ) : !conversation ? (
            <p role="status">
              {loading
                ? 'Loading your conversation…'
                : 'Select Retry to load this conversation.'}
            </p>
          ) : (
            <>
              <header className="agn-support-chat-header">
                <Button
                  variant="ghost"
                  size="small"
                  aria-label="Back to conversations"
                  disabled={locked}
                  onClick={() => setSelected('')}
                >
                  <ArrowLeft size={20} />
                </Button>
                <div>
                  <strong>{conversation.subject}</strong>
                  <p>
                    {conversation.number}
                    {conversation.reference
                      ? ` · ${conversation.reference}`
                      : ''}
                  </p>
                </div>
                <span
                  className={`agn-support-status agn-support-status--${conversation.status}`}
                >
                  {statusName[conversation.status]}
                </span>
              </header>
              <div className="agn-support-chat-meta">
                <span>
                  <i className={live ? 'is-live' : ''} />
                  {live
                    ? 'Live updates connected'
                    : 'Checking for updates automatically'}
                </span>
                <span>
                  {conversation.mode === 'assistant'
                    ? 'Guided support assistant'
                    : conversation.assigneeName
                      ? `With ${conversation.assigneeName}`
                      : 'Waiting for our team'}
                </span>
              </div>
              <div className="agn-support-chat-actions">
                {conversation.status === 'resolved' ? (
                  <Button
                    size="small"
                    disabled={locked}
                    onClick={() => act('reopen')}
                  >
                    Reopen conversation
                  </Button>
                ) : (
                  <>
                    {!staff && conversation.mode === 'assistant' && (
                      <Button
                        size="small"
                        disabled={locked}
                        onClick={() => act('handoff')}
                      >
                        Talk to a person
                      </Button>
                    )}
                    {staff &&
                      !conversation.assignedToMe &&
                      !conversation.assigneeName && (
                        <Button
                          size="small"
                          disabled={locked}
                          onClick={() => act('claim')}
                        >
                          Take over conversation
                        </Button>
                      )}
                    {staff && conversation.assignedToMe && (
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={locked}
                        onClick={() => act('release')}
                      >
                        Return to queue
                      </Button>
                    )}
                    {staff && conversation.assignedToMe && (
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={locked}
                        onClick={() => act('resolve')}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        Mark resolved
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div
                className="agn-support-messages"
                aria-label="Message history"
                ref={messageBox}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  atBottom.current =
                    element.scrollHeight -
                      element.scrollTop -
                      element.clientHeight <
                    60;
                }}
              >
                {olderPage && (
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setOlderPage(null)}
                  >
                    Back to latest messages
                  </Button>
                )}
                {older && (
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => setOlderPage(older)}
                  >
                    Older messages
                  </Button>
                )}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`agn-support-message agn-support-message--${message.author}${message.internal ? ' agn-support-message--internal' : ''}`}
                  >
                    <header>
                      <strong>{message.authorName}</strong>
                      <span>
                        {message.internal
                          ? 'Private staff note'
                          : message.author === 'assistant'
                            ? 'Guided assistant'
                            : message.author === 'staff'
                              ? 'Support team'
                              : ''}
                      </span>
                      <time dateTime={message.createdAt}>
                        {date(message.createdAt)}
                      </time>
                    </header>
                    <p>{message.text}</p>
                    {message.attachments.length > 0 && (
                      <div className="agn-support-files">
                        {message.attachments.map((file) => (
                          <PrivateImage
                            key={file.id}
                            id={file.id}
                            client={client}
                          />
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
              {!staff &&
                conversation.mode === 'assistant' &&
                conversation.status !== 'resolved' && (
                  <div
                    className="agn-support-faqs"
                    aria-label="Guided help topics"
                  >
                    {supportFaqs.map((faq) => (
                      <Button
                        key={faq.id}
                        size="small"
                        variant="secondary"
                        disabled={locked}
                        onClick={() => send(faq.id)}
                      >
                        {faq.title}
                      </Button>
                    ))}
                  </div>
                )}
              {conversation.status !== 'resolved' && (
                <form
                  className={`agn-support-composer${internal ? ' agn-support-composer--internal' : ''}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    send();
                  }}
                >
                  {staff && (
                    <label className="agn-support-note-switch">
                      <input
                        type="checkbox"
                        checked={internal}
                        disabled={locked}
                        onChange={(event) => {
                          imageGeneration.current++;
                          setImageBusy(false);
                          setInternal(event.target.checked);
                          setImages([]);
                        }}
                      />
                      Private staff note · hidden from the buyer
                    </label>
                  )}
                  {staff && !internal && !conversation.assignedToMe && (
                    <p>
                      Take over this conversation before sending a public reply.
                    </p>
                  )}
                  <Textarea
                    label={internal ? 'Private note' : 'Your message'}
                    value={internal ? internalDraft : draft}
                    onChange={(event) =>
                      internal
                        ? setInternalDraft(event.target.value)
                        : setDraft(event.target.value)
                    }
                    maxLength={supportRules.maxText}
                    rows={presentation === 'popup' ? 2 : 3}
                    disabled={
                      locked ||
                      (staff && !internal && !conversation.assignedToMe)
                    }
                    placeholder="Write your message…"
                  />
                  {images.length > 0 && (
                    <div className="agn-support-pending-files">
                      {images.map((image, index) => (
                        <span key={index}>
                          <img
                            src={`data:${image.mime};base64,${image.data}`}
                            alt={`Attachment ${index + 1}`}
                          />
                          <Button
                            variant="ghost"
                            aria-label={`Remove attachment ${index + 1}`}
                            disabled={locked}
                            onClick={() =>
                              setImages((value) =>
                                value.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <X size={16} />
                          </Button>
                        </span>
                      ))}
                    </div>
                  )}
                  <footer>
                    <label className="agn-support-upload">
                      <Paperclip size={18} aria-hidden="true" />
                      {imageBusy
                        ? 'Preparing image…'
                        : imagesEnabled
                          ? 'Attach image'
                          : 'Images unavailable'}
                      <input
                        aria-label="Attach image"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={
                          !imagesEnabled ||
                          locked ||
                          imageBusy ||
                          images.length >= supportRules.maxImages
                        }
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (!file) return;
                          const generation = ++imageGeneration.current;
                          const target = selectedRef.current;
                          setImageBusy(true);
                          void compress(file)
                            .then((image) => {
                              if (
                                alive.current &&
                                generation === imageGeneration.current &&
                                target === selectedRef.current
                              )
                                setImages((value) =>
                                  value.length < supportRules.maxImages
                                    ? [...value, image]
                                    : value,
                                );
                            })
                            .catch((cause) => {
                              if (
                                alive.current &&
                                generation === imageGeneration.current
                              )
                                setError(
                                  cause instanceof Error
                                    ? cause.message
                                    : 'Image could not be prepared.',
                                );
                            })
                            .finally(() => {
                              if (
                                alive.current &&
                                generation === imageGeneration.current
                              )
                                setImageBusy(false);
                            });
                        }}
                      />
                    </label>
                    <Button
                      type="submit"
                      aria-label={
                        presentation === 'popup' && !internal
                          ? 'Send message'
                          : undefined
                      }
                      busy={busy}
                      disabled={
                        locked ||
                        imageBusy ||
                        (!(internal ? internalDraft : draft).trim() &&
                          !images.length) ||
                        (staff && !internal && !conversation.assignedToMe)
                      }
                    >
                      <Send size={17} aria-hidden="true" />
                      {internal
                        ? 'Save private note'
                        : presentation === 'popup'
                          ? 'Send'
                          : 'Send message'}
                    </Button>
                  </footer>
                  <small>
                    Never send passwords, verification codes, BVN, full card
                    details or pickup passes. Images are compressed before
                    upload.
                  </small>
                </form>
              )}
            </>
          )}
        </section>
      </div>
      <CreateConversation
        popup={presentation === 'popup'}
        open={createOpen}
        title={staff ? 'Open a buyer conversation' : 'Start a conversation'}
        onClose={() => {
          if (!locked) setCreateOpen(false);
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            const input = {
              subject:
                presentation === 'popup'
                  ? intro.trim().length >= 3
                    ? intro.trim().slice(0, 80)
                    : 'Support request'
                  : subject,
              topic: topic as SupportCreate['topic'],
              reference,
              text: intro,
              human: staff || human,
              idempotencyKey: crypto.randomUUID(),
              ...(staff ? { buyerEmail } : {}),
            };
            void execute({
              run: () => client.create(input),
              success: (row) => {
                setSelected(row.id);
                setConversation(row);
                setCreateOpen(false);
                setSubject('');
                setIntro('');
                setReference('');
                setBuyerEmail('');
                setNotice('Your conversation has been saved.');
              },
            });
          }}
        >
          <BuyerStack>
            <p>
              {staff
                ? 'Use the buyer’s registered email. This opens a public conversation they can read and reply to.'
                : 'Your conversation stays saved, including when a member of our team joins.'}
            </p>
            {error && (
              <Toast tone="error" emphasis onClose={() => setError('')}>
                {error}
              </Toast>
            )}
            {uncertain && (
              <Button
                busy={busy}
                onClick={() => {
                  if (pending.current) void execute(pending.current);
                }}
              >
                Retry the same request
              </Button>
            )}
            {staff && (
              <Input
                label="Buyer email"
                type="email"
                value={buyerEmail}
                onChange={(event) => setBuyerEmail(event.target.value)}
                required
                disabled={locked}
              />
            )}
            {presentation !== 'popup' && (
              <>
                <Input
                  label="Subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  minLength={3}
                  maxLength={120}
                  required
                  disabled={locked}
                />
                <Select
                  label="Topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  disabled={locked}
                >
                  {supportTopics.map((value) => (
                    <option key={value} value={value}>
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Item or transaction reference (optional)"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  maxLength={80}
                  disabled={locked}
                />
              </>
            )}
            <Textarea
              label="How can we help?"
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
              rows={4}
              maxLength={supportRules.maxText}
              required
              disabled={locked}
            />
            {!staff && (
              <label className="agn-support-note-switch">
                <input
                  type="checkbox"
                  checked={human}
                  onChange={(event) => setHuman(event.target.checked)}
                  disabled={locked}
                />
                Send directly to our support team
              </label>
            )}
            <Button type="submit" busy={busy} disabled={locked}>
              {presentation === 'popup' ? 'Send message' : 'Start conversation'}
            </Button>
          </BuyerStack>
        </form>
      </CreateConversation>
    </section>
  );
}
