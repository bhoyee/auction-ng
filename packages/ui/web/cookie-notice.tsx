'use client';
import { Cookie } from 'lucide-react';
import { Button } from './button';
import { Dialog } from './dialog';

export function CookieNotice({
  visible,
  detailsOpen,
  onAcknowledge,
  onDetails,
  onClose,
}: {
  visible: boolean;
  detailsOpen: boolean;
  onAcknowledge: () => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  return (
    <>
      {visible && (
        <section className="agn-cookie-notice" aria-label="Cookie notice">
          <Cookie size={28} strokeWidth={1.5} aria-hidden="true" />
          <div>
            <h2>Cookies, kept simple.</h2>
            <p>
              We use necessary cookies and browser storage for sign-in, security
              and payments. No advertising or analytics cookies are enabled.{' '}
              <a href="/cookie-policy">Read our Cookie Policy</a>.
            </p>
          </div>
          <div className="agn-cookie-actions">
            <Button variant="secondary" onClick={onDetails}>
              Cookie details
            </Button>
            <Button onClick={onAcknowledge}>Use necessary cookies</Button>
          </div>
        </section>
      )}
      <Dialog open={detailsOpen} onClose={onClose} title="Cookie settings">
        <div className="agn-cookie-details">
          <div>
            <strong>Necessary storage</strong>
            <span>Always active</span>
          </div>
          <p>
            These tools keep you signed in, identify your device, recover a
            payment in progress and remember that you have read this notice.
            Turning them off in your browser may stop those features working.
          </p>
          <p>
            There are currently no optional advertising or analytics cookies to
            switch on or off.
          </p>
          <a href="/cookie-policy">Read the full Cookie Policy</a>
          <Button onClick={onAcknowledge}>Use necessary cookies</Button>
        </div>
      </Dialog>
    </>
  );
}
