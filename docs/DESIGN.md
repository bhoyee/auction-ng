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

Use the 4 px spacing scale. Buyer content shares one centred container: at most 1400 px of usable content with minimum side gutters of 16 px on phones, 24 px on tablets and 32 px on desktop. Header, shopping navigation, hero, section headings, category discovery, rails and footer contents share exactly the same edges. Only background colours may bleed across the viewport. Keep forms at readable widths. Catalogue grids retain two columns on phones, three on tablets and four on desktop; home collections use rails below. Radius hierarchy: badge 4, control 8, card 12, sheet 16. Borders remain restrained; hover cards may use a subtle shadow and 2–4 px lift.

## 4. Components

Owner home-layout amendment (2026-10-27): the unified 1400 px container supersedes the earlier 1800 px marketplace / 1440 px promotion split. Search is capped at 720 px. Retain the simpler second navigation row (All categories left; All deals, Top deals and Ending soon right), rather than reintroducing category-name links. Search has a category selector on larger screens. On scroll, collapse shopping navigation into the sticky main header with restrained elevation. Preserve visible hover/focus feedback, touch targets, narrow forms and reduced motion.

**Home hero:** 70/30 carousel and combined promo stack, both 380 px high on desktop. A slide has a solid text panel (45%) and edge-to-edge product photo (55%); no added white image padding. Keep controls within the text panel on desktop. On phones show only the carousel at 4:3, shorten copy and reserve a separate bottom control row so controls do not cover the photo. Arrows appear on desktop hover or keyboard focus and remain available on touch devices. Preserve pause, keyboard/swipe controls and reduced-motion behaviour. Starting-price promotions must derive from available lots.

**Home rails:** Top deals, Next to close and Starting under ₦10,000 are single-row scrollable collections with previous/next buttons, keyboard focus and See all. Show five complete cards at 1440 px, four at 1280 px, three on tablets and approximately 1.5 on narrow phones. Do not force 2.3 tiny cards onto 360 px. No lot or representative demo photo repeats across home rails. Reserve actual imminent lots for Closing now, then the earliest closing lots, affordable starting prices and retail-estimate comparisons. No category filter chips on home; keep filters on result pages. Category discovery follows the hero/optional closing band, with eight compact photo tiles visible at 1440 px, six at 1280 px and a scrolling phone row. Section headings are 26 px/600 on desktop; card titles 15 px, prices 20 px/700, metadata at least 13 px, footer/trust copy 14 px.

**Lot card:** square edge-to-edge home photos (4:3 remains on catalogue pages); calculated yellow discount badge; condition chip and 44 px heart button over the image. Frame photography carefully without hiding important product/condition details; full detail galleries remain available. Second actual photo on desktop hover when available. Two-line title; large indigo current price, labelled Starting bid only when no bid exists; struck-through retail estimate beside the price, described accessibly as an estimate; accepted bid count when known; clock/countdown; pickup location. Current prices are public over a separate read-only channel; signing in is required to bid/watch. Hide stale prices during disconnection and resnapshot after reconnect. Home cards open through their titles; catalogue Bid now opens the existing fee-reviewed flow. Winning/outbid/won ribbons use text plus colour. Never invent bid counts, discounts, watchers or live prices.

**Lot detail:** large gallery with thumbnails and accessible zoom; sticky bid panel with fresh price, server-time countdown, valid quick-bid amounts, explicit direct/automatic choice, custom amount, estimated total, watch and share. Tabs: Description, Condition, Pickup and delivery, Bid history. Similar-lot rail below. Mobile has a sticky bid action without hiding content.

**Navigation (owner amendment, 2026-10-27):** a quiet white main row contains the wordmark, generous search, icon-led Help dropdown and distinct outlined Sign in / solid indigo Create account actions. Help contains Help centre, FAQs, Contact us, Returns & refunds and configured WhatsApp contact. Signed in retains watchlist, wallet balance/top-up, notifications and account menu with My bids, Invoices, Pickup passes, Account settings and Sign out. A separate lower row keeps All categories left and All deals, Top deals and Ending soon right; category names appear inside the dropdown only. No announcement or demo notice strip. On phones, keep search usable, support controls accessible and shopping links scrollable without clipping menus. Do not expose private data before session refresh. Protected routes redirect to sign in and preserve a validated local return path.

**Search:** icon/input/solid Search button; debounced matching categories and lots; keyboard selection, Escape, labelled suggestions, cancellation of obsolete requests and an explicit unavailable state. Filters and results retain the actual query.

**Header review amendment, 2026-10-27:** WhatsApp is an icon-led item inside Help, not a standalone main-row button. All categories stays left; All deals, Top deals and Ending soon align right. Remove the below-header demo notice; retain existing lot/photo/footer disclosures for synthetic inventory.

**Authentication:** minimal logo/Back to auctions header, no main navigation. Desktop form plus product-photo brand panel and three concrete benefits; single column on mobile. Email → emailed OTP → name. Verified email is the current bidding requirement, alongside account eligibility and funded wallet holds; phone collection and verification come later (owner amendment, 2026-10-26). Email never marks a phone verified. Signup and signin link to each other; retain HttpOnly refresh cookies and memory-only access tokens.

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

1. White marketplace header with wordmark, search, support and account actions; no announcement strip (owner amendment, 2026-10-27).
2. Separate shopping row: All categories dropdown, All deals, Top deals and Ending soon.
3. Category names stay inside the dropdown; photo-based category discovery follows the hero and optional closing band.
4. Hero: desktop 70/30 promotional carousel and combined stacked promos; mobile swipe carousel. Three or four photographic slides on indigo/yellow, with concrete headlines and actions.
5. Signature indigo Closing now band only when actual eligible lots end within twenty minutes: white heading/live dot, horizontal product cards, yellow countdowns and fresh prices.
6. Compact single-row Shop by category: photos, names and actual active-lot counts.
7. Top deals, Next to close and Starting under ₦10,000 rails, each with See all and scroll controls; no repeated lots or filter chip rows.
8. One slim Top up / Bid / Collect strip with three concise trust points, signed-out visitors only; no See all.
9. App preview banner at most 320 px high, inside the same container, with an upright phone and truthful coming-later store copy.
10. Contained footer follows content without trailing empty space: wordmark, Shop/Help/Company/Legal groups, configured pickup information, truthful payment methods and available social/store links. Never dead or invented links.

## 10. Review and performance

Read before coding. Build shared components, not page-specific style fragments. Capture every page at 360, 768 and 1280 px, signed out and in; protected-page signed-out captures should show the correct redirect/auth state. Review as a demanding marketplace design lead, fix deficiencies, then recapture. Record outstanding issues honestly; a functional test pass is not owner visual acceptance.

Home LCP remains below 2.5 s under the agreed mobile profile; initial route JavaScript below 200 KB compressed. Use responsive Next images for hero assets, priority only for the first slide, lazy-load below the fold, and list thumbnails at most 30 KB. Measure against the populated photographed demo, not an empty catalogue. No weakened money, security or test rules to meet a visual target.

Banner editorial direction (2026-10-27): lead with concise tech-focused headlines, solid indigo or pale-indigo copy panels and tightly cropped product photography. Keep controls below the copy and retain 44 px touch targets. Promotional imagery must not imply a pictured model is auction inventory or attach an unrelated lot price. Kitchen promotion is paused; the catalogue category remains available. On phones, prioritise headline, image and action over supporting copy.

Banner quality correction (2026-10-27): the signup slide uses indigo, a bold yellow headline and white supporting copy. Banner images have dedicated responsive derivatives from high-resolution sources; never enlarge catalogue thumbnails or apply a second lossy encoding to precompressed banner assets.

Header search amendment (2026-10-27): the main search field has no category selector; keep category discovery in suggestions and the separate navigation dropdown. Hero side-card Explore actions use solid indigo/white contrast; the first-bid card uses a white bordered surface beside the yellow deals card.

Homepage section amendment (2026-10-27): remove the home category tile row, affordable rail and Next to close rail. Keep Closing now on a white surface with indigo heading and yellow countdowns, then Top deals. A sparse rail keeps the same card widths as a populated rail, aligned left; never stretch one to three cards across the container. Hide scroll arrows when everything fits and hide Closing now when no genuinely imminent lots exist. This supersedes the earlier home order and indigo Closing now band.

Homepage onboarding amendment (2026-10-27): place the signed-out three-card guide directly below the hero and before Closing now. Use Sign up & top up, Bid & win, Pick up & repeat. White bordered cards contain concise factual copy, indigo/pale-indigo/yellow instructional panels and real action links; stack on phones. This replaces the previous lower-page slim guide, avoiding duplicated instructions and unsupported savings/activity claims.

Onboarding card refinement (2026-10-27): owner-selected title case Sign Up & Top / Bid & Win / Pick Up & Repeat, bold 800-weight promotional headings and 32 px outer card corners. Remove visible numbering and the three action links. This narrowly extends the standard radius hierarchy through the shared promotion token; other components retain their existing shapes.

Onboarding artwork amendment (2026-10-27): replace the inner instructional panels with owner-supplied guide-1/2/3 images from public/banners, displayed whole with responsive sizing. Retain headings, descriptions, rounded outer cards, signed-out placement and reduced-motion-aware hover feedback.

Image-only guide amendment (2026-10-27): owner requests only the three supplied guide images below the hero, without the separate section title, headings, descriptions or trust lines. Preserve accessible full-text alternatives, responsive whole-image rendering and hover feedback. Prefer AVIF with WebP fallback, lazy loading, intrinsic dimensions and content-hashed caching for low-data connections.
