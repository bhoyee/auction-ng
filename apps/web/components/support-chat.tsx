'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Button } from '@auction-ng/ui/web/button';
import { Headphones, Minus, X } from '@auction-ng/ui/web/icons';
import { useBuyer } from '../lib/session';

const Chat = dynamic(
  () => import('./customer-service').then((module) => module.BuyerSupport),
  {
    ssr: false,
    loading: () => <p role="status">Opening your conversations…</p>,
  },
);

export function SupportChat() {
  const { tokens } = useBuyer();
  return tokens ? (
    <SignedInSupport key={tokens.user.id} userId={tokens.user.id} />
  ) : null;
}
function SignedInSupport({ userId }: { userId: string }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [conversation, setConversation] = useState('');
  const [newRequest, setNewRequest] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  function open(id?: string) {
    if (id === '') setNewRequest((value) => value + 1);
    if (id !== undefined) setConversation(id);
    setMounted(true);
    setVisible(true);
  }
  function close() {
    setVisible(false);
    launcher.current?.focus();
  }
  useEffect(() => {
    const receive = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (
        detail &&
        typeof detail === 'object' &&
        'userId' in detail &&
        detail.userId === userId &&
        'conversation' in detail &&
        typeof detail.conversation === 'string' &&
        (!detail.conversation || /^[a-f0-9-]{36}$/i.test(detail.conversation))
      )
        open(detail.conversation);
    };
    window.addEventListener('auction-ng-open-support', receive);
    return () => window.removeEventListener('auction-ng-open-support', receive);
  }, [userId]);
  useEffect(() => {
    if (visible) panel.current?.focus();
  }, [visible]);
  if (['/sign-in', '/sign-up', '/forgot-password'].includes(pathname))
    return null;
  return (
    <>
      <button
        type="button"
        ref={launcher}
        className="agn-button agn-button--primary agn-support-launcher"
        onClick={() => (visible ? close() : open())}
        aria-label={visible ? 'Minimise support chat' : 'Open support chat'}
        aria-expanded={visible}
        aria-controls="auction-ng-support-chat"
      >
        <Headphones size={22} aria-hidden="true" />
        <span>Need help?</span>
      </button>
      {mounted && (
        <section
          ref={panel}
          id="auction-ng-support-chat"
          role="dialog"
          aria-label="LotVanta support chat"
          tabIndex={-1}
          hidden={!visible}
          className="agn-support-popup"
          onKeyDown={(event) => {
            if (
              event.key === 'Escape' &&
              !document.querySelector('dialog[open]')
            ) {
              event.preventDefault();
              close();
            }
          }}
        >
          <header className="agn-support-popup-heading">
            <Headphones size={22} aria-hidden="true" />
            <div>
              <strong>LotVanta support</strong>
              <span>Guided help and our support team</span>
            </div>
            <Button variant="ghost" onClick={close} aria-label="Minimise chat">
              <Minus size={20} />
            </Button>
            <Button variant="ghost" onClick={close} aria-label="Close chat">
              <X size={20} />
            </Button>
          </header>
          <div className="agn-support-popup-body">
            <Chat
              key={userId + ':' + conversation + ':' + newRequest}
              initialId={conversation}
              startNew={!conversation && newRequest > 0}
            />
          </div>
        </section>
      )}
    </>
  );
}
