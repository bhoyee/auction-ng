# DESIGN.md — Brand, UI and UX rules

Place this file at `docs/DESIGN.md`. Every agent building web, admin or mobile screens must read it before writing UI code.
The goal: the product must look like it was designed by a professional team for Nigerian buyers — not like a generated template.

> **Working brand name:** "Auction NG" (placeholder). Replace it everywhere once the final name and logo exist.
> Until a designer delivers a logo, use a plain **text wordmark** in the brand typeface. Never generate a logo, mascot or icon art.

---

## 1. Brand idea

**"The evening market, online."** Every evening, hundreds of lots close one after another, like a busy Lagos market where prices move and good deals go fast. The brand should feel:

- **Trustworthy** — real money moves here. Calm layouts, honest photos, clear prices and fees.
- **Lively, not loud** — energy comes from live prices and countdowns, not from gradients and decoration.
- **Local** — Naira first, Nigerian names in examples, Lagos references where natural, plain Nigerian English.

**Visual references in the subject's world:** adire (Yoruba indigo-dyed cloth) for the deep brand colour, and the yellow of Lagos danfo buses for the "live / closing now" signal. Use these as colour inspiration only — no textile patterns, no flag colours, no African-print clip art.

**The one memorable thing:** the *live lot* — the price, the countdown and the yellow "closing" signal. Everything around it stays quiet and disciplined.

---

## 2. Colour tokens

| Token | Hex | Use |
| --- | --- | --- |
| `indigo-900` (brand) | `#1C2A6B` | Header, primary buttons, links, brand moments |
| `indigo-700` | `#2E3F94` | Hover/pressed states of brand elements |
| `indigo-50` | `#EEF0FA` | Selected filters, subtle brand backgrounds |
| `danfo-400` (live) | `#FFC629` | Closing-soon timers, price-change flash, "Live" badge — **only** for live/urgent states |
| `ink` | `#151A30` | Body text and headings |
| `slate-600` | `#556074` | Secondary text |
| `line` | `#E3E6EC` | Borders and dividers |
| `surface` | `#FFFFFF` | Cards, sheets |
| `canvas` | `#F5F6F8` | Page background (cool light grey — not cream) |
| `win-600` | `#127A55` | "You're winning", "Won", payment success |
| `outbid-600` | `#C8341C` | "Outbid", errors, failed payment |

Rules:
- Yellow is a **signal, never decoration**. If nothing is urgent or live on a screen, no yellow appears.
- Text on yellow is always `ink`, never white.
- All text meets WCAG AA contrast (4.5:1 body, 3:1 large text). Check secondary text on `canvas`.
- Dark mode: phase 2. Build with tokens from day one so it can be added.
- Tokens live in `packages/ui/tokens.ts` and are shared by web (Tailwind theme + CSS variables) and mobile (a theme object). No hex values in components.

## 3. Typography

- **Typeface:** *Schibsted Grotesk* (Google Fonts, free) for everything — headings, UI and numbers. One family, used with deliberate weights. It is sturdy and readable on cheap screens and has good numerals.
- **Prices and timers:** `font-variant-numeric: tabular-nums` so digits don't jump as they change.
- **Scale (web, px / line height):** 32/38 page title · 24/30 section title · 20/26 lot title on detail page · 16/24 body · 14/20 secondary · 12/16 fine print only. Mobile uses the same scale minus 2 px for the two largest sizes.
- **Weights:** 700 for prices and page titles, 600 for section titles and buttons, 400 for body.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrow text above headings.
- Line length under 75 characters for any paragraph.

## 4. Layout and components

**Grid and spacing**
- 4 px base unit; spacing steps 4, 8, 12, 16, 24, 32, 48, 64.
- Web: max content width 1240 px, 12-column grid, 24 px gutters. Mobile web and app: 16 px side padding.
- Lot grid: 2 columns on phones, 3 on tablets, 4–5 on desktop.

**Radius hierarchy (not one radius for everything)**
- 4 px: badges and small chips · 8 px: buttons and inputs · 12 px: lot cards and photos · 16 px top corners: bottom sheets · full round: avatars and the live pill only.

**Elevation**
- Flat by default: cards are separated by a 1 px `line` border on `canvas`, not shadows.
- Shadow only on things that float: bottom sheets, menus, the sticky bid bar.

**Lot card (the most repeated component — make it excellent)**
- Square photo first (real product photo on a plain background, no stock images).
- Below: title (2 lines max), condition grade chip, current price large and bold, retail price small and struck through, countdown.
- Countdown turns `danfo-400` under 10 minutes; shows seconds under 2 minutes.
- Watch (heart/bookmark) button top-right of the photo, 44 px touch area.
- Status ribbon on the photo when relevant: "Winning" (green), "Outbid" (red), "Won".

**Lot detail page**
- Web: photo gallery left, bid panel right (sticky). Mobile: gallery top, details, then a **sticky bid bar** at the bottom with price, timer and "Place bid".
- Bid panel shows: current price, number of bids, time left, minimum next bid, one-tap buttons for the next 3 valid amounts, a field for a custom maximum, and the **estimated total** (bid + premium + fees + VAT) before confirming.
- Below: condition grade with a plain explanation, what's included / missing, pickup location and hours, delivery availability, bid history (masked names: "Ad***e").

**Navigation**
- Web header: wordmark, search (always visible on desktop), Categories, Ending soon, Wallet balance, account.
- Mobile app tab bar (5 max): Home, Search, Watchlist, My bids, Account. Wallet balance visible on Home and Account.

**Icons:** one icon set only — *Lucide* (web and `lucide-react-native`). 1.75 px stroke, 20/24 px sizes. No emoji in the UI.

**Imagery:** product photos taken by staff on a plain light background with consistent framing. No stock photos of smiling people, no AI-generated images, no 3D illustrations. Empty states use a simple Lucide icon and helpful text, not illustrations.

## 5. Motion

Motion only answers something that happened:
- Price update: the price briefly flashes a `danfo-400` background (300 ms) and settles.
- Outbid: the card or bid bar shakes once lightly and turns red with a message.
- Won: one short celebration on the win screen (confetti or a check animation, under 1.5 s). Only there.
- Sheets and menus slide in 200 ms with ease-out.
- No fade-and-slide-up on scroll, no parallax, no hover animations on every card, no auto-playing carousels.
- Respect "reduce motion" settings on web and mobile.

## 6. UX rules

**Bidding**
- From any lot card, a bid is at most two taps away: open lot → tap amount → confirm.
- Always show the **total the buyer will pay** before they confirm. No surprise fees.
- After tapping, show the result in under a second: "You're winning at ₦12,500" or "Someone has a higher maximum. Bid at least ₦13,000 to lead."
- Never show a stale price: if the connection drops, grey the bid button and show "Reconnecting…", then refresh.
- Low wallet balance: show the shortfall and a "Top up ₦X" button that opens the wallet account number in one tap.

**Wallet**
- The personal account number is shown large with a copy button and the bank name. Explain in one line: "Transfer any amount to this account. It reaches your wallet in minutes."
- Pending transfers are shown as pending, never as missing.

**States every screen must design for:** loading (skeletons shaped like the content, not spinners), empty, error, offline, and success.

**Forms:** labels above fields, Nigerian phone format hint (0803 123 4567), inline errors that say how to fix the problem, numeric keypad for amounts and OTPs, OTP auto-fill on Android.

**Accessibility:** 44 × 44 px minimum touch targets, visible keyboard focus on web, screen-reader labels on icon buttons and timers ("2 minutes 30 seconds left"), never rely on colour alone (always pair with text or icon).

**Performance is UX:** follow the budgets in AGENTS.md §7. A beautiful page that loads in 6 seconds on 4G is a failed design.

## 7. Writing (UI copy)

- Plain Nigerian English, friendly and direct. Short sentences. Sentence case.
- Buttons say exactly what happens: "Place bid ₦12,500", "Top up wallet", "Book pickup slot" — not "Submit", "Continue" or "Get started".
- Keep the same word through a flow: the button "Place bid" leads to "Bid placed".
- Errors explain what happened and what to do, without apologising: "Your wallet has ₦4,000. Add ₦8,800 to place this bid."
- Use real-looking Nigerian examples in placeholders and seed data (names like Chiamaka, Tunde, Halima; places like Ikeja, Lekki, Wuse).
- Banned words and phrases: "Revolutionize", "Unlock", "Seamless", "Elevate", "Supercharge", "Game-changer", "Your journey", "Effortless", "Next-level".

## 8. Anti-"AI-generated" checklist

Reject a screen if it has any of these:

- [ ] Purple/blue gradient backgrounds or gradient text
- [ ] Glassmorphism, blurred blobs, glowing orbs or mesh gradients
- [ ] Every section chopped into identical rounded cards with the same soft shadow
- [ ] Generic SaaS hero: giant headline + subtitle + two buttons + floating mockup
- [ ] "Trusted by" logo strips, fake testimonials or invented statistics
- [ ] Three-column "feature" blocks with icons in coloured circles
- [ ] ALL-CAPS letter-spaced labels above headings
- [ ] One word in a headline coloured or italicised for emphasis
- [ ] Emoji used as icons
- [ ] Stock photos, AI images, or 3D illustrations
- [ ] Inter, Roboto or system font as the brand font (system font is fine only as a fallback)
- [ ] Arrows (→) added to every link and button
- [ ] Fade-in-on-scroll animations on every section
- [ ] Lorem ipsum or US-centric placeholder data ($, ZIP code, "John Doe")

## 9. Screen list for the MVP

Buyer (web + mobile): Home · Category · Search results · Lot detail · Bid confirm sheet · My bids (Winning / Outbid / Won / Lost tabs) · Watchlist · Wallet (account number, balance, history) · Invoices · Pickup pass (QR) · Book pickup slot · Sign up / OTP · Account and settings · Empty, error and offline states.

Admin: Login · Lot intake · Lot list · Auction scheduler · Pickup desk scanner · Refunds · Users · Audit log.

**Home page structure (web and app):**
1. Header with search.
2. **Closing now** — a horizontal row of lots closing in the next 15 minutes with live prices (the signature element).
3. Category shortcuts (photo tiles, not icon circles).
4. Ending tonight grid.
5. New today grid.
6. Short "How it works" strip (three plain steps: Top up, Bid, Pick up) — only for signed-out visitors.
7. Footer: pickup locations and hours, help, terms.

## 10. How agents must work on UI

1. Read this file and the relevant screen's mockup in `docs/design/` (if it exists) before coding.
2. Build from the shared components in `packages/ui` — never one-off styling. Add a component there if it's missing.
3. Use real seed data, not lorem ipsum.
4. After building a screen, take screenshots at 360 px, 768 px and 1280 px (Playwright for web; simulator/emulator for mobile), review them against this file and the checklist in §8, fix problems, then include the screenshots in the PR.
5. When a design decision isn't covered here, choose the simpler, quieter option and note it in the summary.
