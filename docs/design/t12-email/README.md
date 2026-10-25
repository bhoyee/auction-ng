# Winner email review

Reviewed at [360 px](winner-email-360.png), [768 px](winner-email-768.png) and [1280 px](winner-email-1280.png), using the existing Playwright browser setup.

The layout uses the shared brand tokens, a Schibsted Grotesk-first email font stack with Arial fallback, indigo wordmark, flat bordered surface and sentence-case headings. Fees and the total use tabular numerals. No remote font or image request is needed. The inbox may use the fallback font when it cannot load Schibsted Grotesk locally.

Checks: no horizontal overflow at any size; readable itemised Naira amounts; clear payment and pickup instructions; no gradients, shadows, illustrations, invented statistics, decorative yellow or private pickup token. Plain text accompanies HTML. Product screens and pickup booking remain later tasks.

Regenerate the email asset with `pnpm tokens:generate`. Run `pnpm exec playwright test tests/e2e/winner-email.spec.ts` to render the layouts again. The fixture is synthetic and contains no credentials or personal data.
