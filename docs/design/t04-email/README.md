# Sign-in email review

The owner requested a professional sign-in message as a T04 follow-up. This is a transactional email only; D01's product component library and app layouts remain separate tasks.

Reviewed Chromium previews using the synthetic code `012345`:

- [360 px](sign-in-email-360.png)
- [768 px](sign-in-email-768.png)
- [1280 px](sign-in-email-1280.png)

The message uses the existing indigo, canvas, white and border tokens, a text wordmark, one clear code block, readable expiry/security copy and a quiet footer. No gradients, shadows, illustrations, remote images, decorative yellow, invented contacts or marketing claims. The code is a contiguous selectable text value rather than six separate boxes.

The template declares Schibsted Grotesk first and an email-safe Arial/sans-serif fallback. It deliberately makes no external font request: mailbox font support varies and no production asset domain exists yet. These previews show the fallback that recipients without the brand font will see. Browser previews check layout and overflow; they do not establish compatibility with every Outlook/Gmail/Apple Mail version. Table layout, inline styles and an Outlook width wrapper provide a conservative baseline for later real-provider testing.

Source: `packages/ui/emails/sign-in-email.ts`. `pnpm tokens:generate` creates the committed API JSON asset from that source and the design tokens, avoiding a UI-framework dependency in the API. A test detects stale generated output. The delivery adapter inserts only a validated six-digit code and sends both HTML and plain text. Neither version is written to application logs.
