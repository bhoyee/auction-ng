'use client';
export function CookieSettingsButton() {
  return (
    <button
      type="button"
      className="agn-cookie-settings-link"
      onClick={() =>
        window.dispatchEvent(new Event('auction-ng-cookie-settings'))
      }
    >
      Cookie settings
    </button>
  );
}
