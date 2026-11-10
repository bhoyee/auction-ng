'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CircleCheck, Send } from '@auction-ng/ui/web/icons';
import {
  contactMessageInputSchema,
  contactTopicLabels,
  contactTopics,
  type ContactMessageInput,
} from '@auction-ng/shared/contact-schemas';
import { ApiError } from '@auction-ng/api-client/auth';
import { createContactClient } from '@auction-ng/api-client/contact';
import { Button } from '@auction-ng/ui/web/button';
import { FormError } from '@auction-ng/ui/web/form-error';
import { Input } from '@auction-ng/ui/web/input';
import { apiUrl } from '../lib/session';

type Topic = (typeof contactTopics)[number];
type Fields = {
  name: string;
  email: string;
  topic: Topic | '';
  reference: string;
  message: string;
};
type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
    },
  ) => string;
  reset: (id?: string) => void;
};

const empty: Fields = {
  name: '',
  email: '',
  topic: '',
  reference: '',
  message: '',
};
const fieldErrors: Record<keyof Fields, string> = {
  name: 'Enter your full name.',
  email: 'Enter an email address we can reply to, like ada@example.com.',
  topic: 'Choose what your message is about.',
  reference: 'Use only letters, numbers, spaces, # / - or _ (up to 40).',
  message: 'Tell us a little more: at least 10 characters (up to 3,000).',
};
const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
const client = createContactClient(apiUrl);

export function ContactForm() {
  const [fields, setFields] = useState<Fields>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [sent, setSent] = useState<{ reference: string; email: string }>();
  const [token, setToken] = useState('');
  const website = useRef<HTMLInputElement>(null);
  // One key per message: a retry after a dropped connection reuses it, so
  // the team never receives the same message twice.
  const requestKey = useRef('');
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const confirmation = useRef<HTMLDivElement>(null);

  // The form is taller than the confirmation, so bring it into view.
  useEffect(() => {
    if (!sent) return;
    confirmation.current?.scrollIntoView({ block: 'center' });
    confirmation.current?.focus({ preventScroll: true });
  }, [sent]);

  useEffect(() => {
    if (!siteKey || sent) return;
    const mount = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!api || !widget.current || widgetId.current) return;
      widgetId.current = api.render(widget.current, {
        sitekey: siteKey,
        callback: setToken,
        'expired-callback': () => setToken(''),
      });
    };
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile]',
    );
    if (existing) {
      mount();
      existing.addEventListener('load', mount);
      return () => existing.removeEventListener('load', mount);
    }
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.dataset.turnstile = 'true';
    script.addEventListener('load', mount);
    document.head.append(script);
    return () => script.removeEventListener('load', mount);
  }, [sent]);

  const update = (key: keyof Fields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    requestKey.current = '';
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    const input: ContactMessageInput = {
      requestKey: requestKey.current,
      name: fields.name,
      email: fields.email.trim(),
      topic: fields.topic as Topic,
      ...(fields.reference.trim() ? { reference: fields.reference } : {}),
      message: fields.message,
      ...(website.current?.value ? { website: website.current.value } : {}),
      ...(token ? { turnstileToken: token } : {}),
    };
    const parsed = contactMessageInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: Partial<Record<keyof Fields, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && key in fieldErrors)
          next[key as keyof Fields] = fieldErrors[key as keyof Fields];
      }
      setErrors(next);
      if (!Object.keys(next).length)
        setFailure(
          'Something went wrong. Please refresh the page and try again.',
        );
      return;
    }
    if (siteKey && !token) {
      setFailure('Please complete the security check above the button.');
      return;
    }
    if (!navigator.onLine) {
      setFailure(
        'You are offline. Check your connection, then press Send message again.',
      );
      return;
    }
    setBusy(true);
    try {
      const result = await client.send(parsed.data);
      setSent({ reference: result.reference, email: parsed.data.email });
      setFields(empty);
      requestKey.current = '';
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      setFailure(
        status === 429
          ? 'You have sent several messages in the last hour. Please wait a while, or reach us on WhatsApp.'
          : status === 400
            ? 'Please check your details and the security check, then try again.'
            : 'We could not send your message. Check your connection and press Send message again.',
      );
      if (siteKey && status !== 0) {
        setToken('');
        const api = (window as unknown as { turnstile?: TurnstileApi })
          .turnstile;
        api?.reset(widgetId.current);
      }
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <div
        ref={confirmation}
        className="agn-contact-sent"
        role="status"
        tabIndex={-1}
      >
        <CircleCheck size={40} aria-hidden="true" />
        <h3>Message sent</h3>
        <p>
          Your reference is <strong>{sent.reference}</strong>. We are sending a
          confirmation to {sent.email} and will reply within 1 working day.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            widgetId.current = undefined;
            setToken('');
            setSent(undefined);
          }}
        >
          Send another message
        </Button>
      </div>
    );

  return (
    <form className="agn-contact-form" noValidate onSubmit={submit}>
      {failure && (
        <FormError message={failure} onDismiss={() => setFailure('')} />
      )}
      <div className="agn-contact-form-row">
        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          value={fields.name}
          maxLength={120}
          onChange={(event) => update('name', event.target.value)}
          error={errors.name}
          placeholder="Chiamaka Okafor"
        />
        <Input
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={fields.email}
          maxLength={254}
          onChange={(event) => update('email', event.target.value)}
          error={errors.email}
          placeholder="chiamaka@example.com"
        />
      </div>
      <div className="agn-contact-form-row">
        <div className="agn-field">
          <label htmlFor="contact-topic">What is it about?</label>
          <select
            id="contact-topic"
            name="topic"
            className="agn-input"
            value={fields.topic}
            aria-invalid={Boolean(errors.topic)}
            aria-describedby={errors.topic ? 'contact-topic-help' : undefined}
            onChange={(event) => update('topic', event.target.value)}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {contactTopics.map((topic) => (
              <option key={topic} value={topic}>
                {contactTopicLabels[topic]}
              </option>
            ))}
          </select>
          {errors.topic && (
            <p id="contact-topic-help" className="agn-field-error">
              {errors.topic}
            </p>
          )}
        </div>
        <Input
          label="Item ID or invoice (optional)"
          name="reference"
          value={fields.reference}
          maxLength={40}
          onChange={(event) => update('reference', event.target.value)}
          error={errors.reference}
          placeholder="e.g. INV-20418"
        />
      </div>
      <div className="agn-field">
        <label htmlFor="contact-message">Your message</label>
        <textarea
          id="contact-message"
          name="message"
          className="agn-input agn-contact-message"
          rows={6}
          maxLength={3000}
          value={fields.message}
          aria-invalid={Boolean(errors.message)}
          aria-describedby="contact-message-help"
          onChange={(event) => update('message', event.target.value)}
          placeholder="Tell us what happened and what you need help with."
        />
        <p
          id="contact-message-help"
          className={errors.message ? 'agn-field-error' : 'agn-hint'}
        >
          {errors.message ??
            'Do not include your password, sign-in code or card details.'}
        </p>
      </div>
      {/* Hidden from people; bots that fill every field are rejected. */}
      <div className="agn-contact-trap" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          ref={website}
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      {siteKey && <div ref={widget} className="agn-contact-turnstile" />}
      <Button type="submit" size="large" busy={busy}>
        <Send size={18} aria-hidden="true" />
        Send message
      </Button>
    </form>
  );
}
