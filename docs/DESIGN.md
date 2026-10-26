# Auction NG — Marketplace design rules

Owner-approved direction, 2026-10-26. This replaces the earlier quiet, document-like buyer design. Keep the marketplace photographic, energetic, useful and trustworthy. AGENTS.md §13 reflects this approval. T14 remains a separate task.

## 1. Brand and visual hierarchy

“The evening market, online.” Use adire indigo for brand, actions, full-width auction sections and photographic banners. Use danfo yellow for deals, promotions and urgency. White product cards sit on a cool light-grey canvas. Winning is green; outbid and errors are red. Avoid decorative noise: the products, prices and closing times supply the energy.

Until a final logo exists, use the Schibsted Grotesk text wordmark. Never invent a logo or use another company's logo as hero art.

## 2. Shared tokens

All colour, typography, motion, radius and elevation values originate in `packages/ui/tokens.ts`, with generated CSS/Tailwind and a native theme. Screens use shared classes/components, never custom hex colours.

| Token | Value | Purpose |
| --- | --- | --- |
| indigo-900 | #1C2A6B | Brand, primary actions, banners and auction bands |
| indigo-700 | #2E3F94 | Hover and active brand actions |
| indigo-50 | #EEF0FA | Selected filters and subtle panels |
| danfo-400 | #FFC629 | Deals, promotions, live and closing signals |
| ink | #151A30 | Main text and text on yellow |
| slate-600 | #556074 | Secondary text |
| line | #E3E6EC | Borders and dividers |
| surface | #FFFFFF | Product cards and forms |
| canvas | #F5F6F8 | Page canvas |
| win-600 | #127A55 | Winning, won and payment success |
| outbid-600 | #C8341C | Outbid, errors and final-minute urgency |

Text meets WCAG AA: 4.5:1 body, 3:1 large text. Yellow backgrounds use ink text. Prices/timers use tabular numerals; ordinary prose uses proportional punctuation. Sentence case throughout.

## 3. Typography and spacing

Schibsted Grotesk everywhere, locally hosted; system fonts are fallback only. Body 16/24, secondary 14/20, fine print 12/16; section headings 24/30 and page titles 32/38. Promotional headlines may be larger through shared responsive tokens. Prices and titles use deliberate 600–700 weights. No letter-spaced all-caps eyebrows. No spaces before punctuation.

Use the 4 px spacing scale, a 1240 px content container, 24 px desktop gutters and 16 px mobile padding. Product grids use two columns on phones, three on tablets and four or five on wide screens. Keep forms at readable widths. Radius hierarchy: badge 4, control 8, card 12, sheet 16. Borders remain restrained; hover cards may use a subtle shadow and 2–4 px lift.

## 4. Components

**Lot card:** 4:3 edge-to-edge photo; calculated yellow discount badge; condition chip and 44 px heart button over the image. Second actual photo on desktop hover when available. Two-line title; large indigo current price, labelled starting bid if no fresh live state; struck-through retail estimate; accepted bid count when known; clock/countdown; pickup location. Yellow countdown under ten minutes, red urgency under one minute. Bid now opens the existing fee-reviewed bidding flow. Show it on mobile and desktop hover/focus. Winning/outbid/won ribbons use text plus colour. Never invent bid counts, discounts, watchers or live prices.

**Lot detail:** large gallery with thumbnails and accessible zoom; sticky bid panel with fresh price, server-time countdown, valid quick-bid amounts, explicit direct/automatic choice, custom amount, estimated total, watch and share. Tabs: Description, Condition, Pickup and delivery, Bid history. Similar-lot rail below. Mobile has a sticky bid action without hiding content.

**Navigation:** signed out shows logo, all-categories menu, search, Ending soon, How it works, Sign in and solid Create account. Signed in shows logo, categories, search, Ending soon, Watchlist icon, wallet balance/top-up chip, notifications and account menu with My bids, Invoices, Pickup passes, Account settings and Sign out. Do not expose private data before session refresh. Protected routes redirect to sign in and preserve a validated local return path.

**Search:** icon/input/solid Search button; debounced matching categories and lots; keyboard selection, Escape, labelled suggestions, cancellation of obsolete requests and an explicit unavailable state. Filters and results retain the actual query.

**Authentication:** minimal logo/Back to auctions header, no main navigation. Desktop form plus product-photo brand panel and three concrete benefits; single column on mobile. Email → emailed OTP → name, with optional phone. Email never implies verified phone. Signup and signin link to each other; retain HttpOnly refresh cookies and memory-only access tokens.

**Wallet:** prominent available and held amounts, personal transfer account/copy, card or transfer funding, gross payment/provider fee/net credit before confirmation, pending payments and cursor history. Never show synthetic demo funds as real funds.

Shared components also cover menus, filters, product rails, notifications, invoices, private QR passes, account settings and loading/empty/error/offline states. Lucide icons only, consistent stroke and 20/24 px sizes.

## 5. Photography and demo truthfulness

Actual sale lots require photos of the actual item, taken by staff. Clearly labelled local demos may use free Unsplash/Pexels product photographs approved by the owner. Download, optimise to WebP and credit each source, photographer and licence in `apps/web/public/demo/CREDITS.md`. Do not use premium/Unsplash+ content, AI images, unrelated lifestyle people, external QR services or brand logos as hero artwork.

Every demo lot and category tile has a matching product photo. Demo images are representative, not evidence of condition inspection. Mark demo content and promotional sample pricing visibly. Financial test activity uses isolated demo data through the existing money/bid services. Never add fake activity to real stock.

## 6. Motion, controls and accessibility

Allow restrained 150 ms hover lift, image zoom up to 1.05, content-shaped shimmer skeletons, smooth carousels, live dots, price flashes and bid/outbid toasts. No parallax or scroll-entry animations. Respect reduced motion: stop autoplay, shimmer, pulses and transforms. Hero autoplay every six seconds pauses on hover, focus or interaction; provide pause, arrows, dots, keyboard and mobile swipe controls. Do not announce every autoplay slide to screen readers.

Touch targets are at least 44 × 44 px. Visible focus, keyboard-operable menus/dialogs, useful alt text, readable timers and non-colour status indicators are mandatory. Links in navigation, headings and cards have no underlines; inline paragraph links may be underlined. Buttons have clear solid/outline hierarchy, hover and focus states.

Bidding retains disclosed fees, immutable retries, fresh socket prices and server-clock offsets. Disconnection disables bids and explains reconnection. Loading, truly empty, error, offline and success states must be designed, but a populated demo homepage must not normally consist of empty-state panels.

## 7. Copy and claims

Plain Nigerian English, Naira formatting and Lagos time. Buttons describe their actions. Avoid inflated SaaS language and generic promises. Use actual category counts, stock, accepted bids, locations and available payment methods. Promotional savings are derived from price versus retail estimate, labelled as estimates and never guaranteed final savings. No unsupported “instant transfer” promise.

Do not advertise delivery, store downloads, inspection, warehouse addresses/hours or legal policies as available unless they are configured and true. Until launched, label delivery and native store releases as coming later. Use a Naira price promotion rather than “Dollar deals”. Demo schedules are relative to server time; announcement copy must agree with actual lots.

## 8. Anti-generated checklist

Reject generic SaaS heroes, purple gradients, glassmorphism, glowing blobs, fake testimonials/statistics, repetitive same-shaped feature cards, all-caps eyebrows, emoji icons, AI imagery, lorem ipsum, US-centric examples, uncredited stock, misleading claims, blanket underlining and image-less product grids. Reject desktop-only polish that breaks at 360 px. A concrete three-step Top up → Bid → Collect guide is approved; it is not a generic feature strip.

## 9. Home page order

1. Thin indigo announcement with truthful current schedule/pickup information.
2. Contextual marketplace header and all-categories photo/icon menu.
3. Horizontally scrollable category pills.
4. Hero: desktop 2/3 promotional carousel plus 1/3 stacked promos; mobile swipe carousel. Three or four photographic slides on indigo/yellow, with concrete headlines and actions.
5. Signature indigo Closing now band: white heading/live dot, horizontal product cards, yellow countdowns and fresh prices.
6. Four-item trust/payment/pickup strip, with demo and unavailable-service qualifications where needed.
7. Top deals grid, Ending soon, Under ₦10,000, each with See all and useful filters/tabs.
8. Shop by category: photos, names and actual active-lot counts.
9. Three large-icon steps: Top up, Bid, Collect.
10. Native app preview banner; real store badges only when listings exist, otherwise clear coming-later copy.
11. Full footer: wordmark, Shop/Help/Company/Legal groups, configured pickup information, truthful payment methods and available social/store links. Never dead or invented links.

## 10. Review and performance

Read before coding. Build shared components, not page-specific style fragments. Capture every page at 360, 768 and 1280 px, signed out and in; protected-page signed-out captures should show the correct redirect/auth state. Review as a demanding marketplace design lead, fix deficiencies, then recapture. Record outstanding issues honestly; a functional test pass is not owner visual acceptance.

Home LCP remains below 2.5 s under the agreed mobile profile; initial route JavaScript below 200 KB compressed. Use responsive Next images for hero assets, priority only for the first slide, lazy-load below the fold, and list thumbnails at most 30 KB. Measure against the populated photographed demo, not an empty catalogue. No weakened money, security or test rules to meet a visual target.
