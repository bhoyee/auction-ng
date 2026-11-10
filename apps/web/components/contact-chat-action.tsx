'use client';
import { ArrowRight } from '@auction-ng/ui/web/icons';
import { useBuyer } from '../lib/session';

// Signed-in buyers open the existing support chat; guests sign in first and
// come back here.
export function ContactChatAction() {
  const { tokens, ready } = useBuyer();
  if (ready && tokens)
    return (
      <button
        type="button"
        className="agn-button agn-button--secondary"
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('auction-ng-open-support', {
              detail: { userId: tokens.user.id, conversation: '' },
            }),
          )
        }
      >
        Start a chat
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    );
  return (
    <a
      className="agn-button agn-button--secondary"
      href={`/sign-in?${new URLSearchParams({ next: '/contact' })}`}
      aria-disabled={!ready || undefined}
    >
      Sign in to chat
      <ArrowRight size={18} aria-hidden="true" />
    </a>
  );
}
