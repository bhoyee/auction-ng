# LotVanta — Marketplace design rules

Transactional email amendment (2026-11-08): use the actual LotVanta logo and shared indigo banner with yellow detail from `packages/ui/emails/brand.ts` across buyer and staff templates. Keep an optimised embedded CID logo for SMTP, the same inline asset for local preview, readable alt text and a complete plain-text version. No tracking pixels or remote font/image requests. Collection receipts clearly separate payment deadlines from saved WAT pickup deadlines and display the recorded storage policy, readiness, waiver and collected state without inventing dates or fees.

Staff navigation amendment (2026-11-08): every staff page uses one shared grouped sidebar and the same logo, role badge, responsive collapse/drawer and shell styling. Do not switch to a legacy menu outside Overview/Live monitor. Keep current permission filtering, Categories/Pickup centres inside Inventory, one active destination per sidebar and explicit disabled Later items for unfinished pages. Finance destination tabs persist in their links and restore on reload.

Overview actual-source amendment (2026-11-07): figures come from real application aggregates, including seeded application records during development. Remove demo chips when mode is aggregate; never manufacture missing expenses or stock valuation. Show compact per-source WAT timestamps, financial five-minute refresh guidance and a delayed-update notice when current snapshots fall behind. Preserve confirmed data during refresh; signed fee-refund totals use a true minus sign before Naira without changing non-negative payment fields.

Staff Overview refinement (2026-11-07): header search is an inline field with anchored, permission-filtered record matches and typed page shortcuts; no initial duplicate navigation menu. Keep 250ms debounce, keyboard access and explicit empty/error states. Export and yellow Check in a buyer sit at the greeting's right edge, stacking on phones; date filters sit below. Hide comparison controls/empty comparison labels for now. Show only a 12px WAT range/update line below the greeting and no duplicate name beside the avatar.

Pickup storage amendment (2026-11-06): keep storage within Pickup desk and buyer collection pages. Use compact responsive item rows with item/invoice, saved WAT deadline, distinct overdue/review status, rate/cap and bold separately labelled outstanding storage. Quote payment in an accessible modal with aligned storage, processing charge and total, explicit buyer confirmation and persistent paid/review/error states. Centre calendar/rate editing and reasoned staff adjustments use labelled shared controls. Keep contact/review distinct from forfeiture; do not add an active forfeiture action.

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

Fixed-price purchase amendment (2026-10-28): an authoritative optional catalogue price adds a compact yellow trophy/Naira pill directly below the condition badge, without Buy now text in the pill. Keep the auction price and segmented countdown separate. Detail checkout uses a restrained shared panel with fixed item price, 7.5% tax, processing charge and total before confirmation; wallet/card/transfer choices, reservation countdown, cancellation, offline/error/retry and paid receipt states. Use the existing white surfaces, indigo actions, brand font and touch targets. Admin pricing is an optional explicitly saved Naira input with a tax/zero-auction-fee hint. Fixed-price invoices label the item price and item tax; cancelled competition remains visible in My bids rather than deleting history.

Item-photo countdown amendment (2026-10-28): place the four segmented day/hour/minute/second countdown at the bottom centre of the product image, with rounded outer corners and fine light dividers. Use indigo/white normally and red/white in the final 20 minutes, readable at 360 px and visible without hover. Keep condition/watch controls at the top. Remove card bid-count badges; retain the count on the detail-page Bid history tab. This supersedes the separate metadata timer/count row; authoritative clocks, reconnect feedback and expiry removal are unchanged.

Unsold relisting amendment (2026-10-28): keep the existing compact lot editor. Add a separate pale-indigo relisting row with a labelled checkbox, used-retry count and explicit Save relisting action; stack naturally on phones and retain 44 px targets. Closed auctions are read-only. An Unsold awaiting review filter shows stock with no replacement, using the existing loading, empty, error and offline states. Preserve the visual condition grade when stock is relisted; the setting never changes product details.

Admin curation amendment (2026-10-28): use the existing brand font/tokens and compact white bordered editor rows. Each row shows a lot title/reference/status, Feature in Top Deals checkbox, numeric display order and explicit Save selection action. Stack controls at 360 px, retain 44 px targets and visible labels/focus, and provide loading, empty, offline, save-success, permission and stale-edit states. Password/authenticator sign-in has no public signup or buyer-login fallback. Buyer Top Deals uses only the administrator's selection/order, never an automatic discount ranking.

Past Auctions amendment (2026-10-27): bold public support email belongs under Help; Explore includes Past Auctions. The archive uses flat photo cards with a Sold badge, final winning price and Lagos closing date. No live countdown, bid/watch controls or buyer identity on historical sale cards. Show only server-confirmed paid purchases; provide an honest empty state, bounded older-page navigation and existing loading/error/offline handling.

Footer arrangement amendment (2026-10-27): render X, Facebook, Instagram, TikTok and WhatsApp icons below the email, with actual profile URLs configurable and absent URLs visibly non-interactive. Social trademark SVGs are permitted. Place payment marks directly below Legal without a separate payment band or Paystack label. Remove footer demo copy and all footer link underlines. Fine-pointer desktop link rows use 32 px; touch devices retain 44 px. This supersedes the preceding footer payment-row arrangement.

Compact footer correction (2026-10-27): reduce footer link gaps to zero between 44 px targets, top padding 32 px, content bottom padding 24 px and payment/bottom bars 16 px. Use Explore, Help and Legal groups. Replace contact-support copy with the email and configured social icons. No footer cookie-settings action or bidding reminder; settings remain reachable through policy pages. Payment marks may use their trademark colours, with no unsupported payment methods advertised.

Footer/policy amendment (2026-10-27): use a full-bleed dark indigo footer with the shared content container, legible light links, clear Explore/Help/Legal groups and 44 px link targets. Keep payment information factual and public support configurable. Policy pages use a restrained reading column and responsive contents navigation; distinguish drafts from approved production terms. The cookie notice is a compact, non-blocking floating surface describing actual storage, with keyboard-accessible details and a persistent footer settings control. Do not invent optional trackers or consent switches.

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

Home LCP remains below 3.0 s (median of three Lighthouse runs, owner-approved 2026-11-10) under the agreed mobile profile; initial route JavaScript below 230 KB compressed (owner-approved 2026-11-10). Use responsive Next images for hero assets, priority only for the first slide, lazy-load below the fold, and list thumbnails at most 30 KB. Measure against the populated photographed demo, not an empty catalogue. No weakened money, security or test rules to meet a visual target.

Banner editorial direction (2026-10-27): lead with concise tech-focused headlines, solid indigo or pale-indigo copy panels and tightly cropped product photography. Keep controls below the copy and retain 44 px touch targets. Promotional imagery must not imply a pictured model is auction inventory or attach an unrelated lot price. Kitchen promotion is paused; the catalogue category remains available. On phones, prioritise headline, image and action over supporting copy.

Banner quality correction (2026-10-27): the signup slide uses indigo, a bold yellow headline and white supporting copy. Banner images have dedicated responsive derivatives from high-resolution sources; never enlarge catalogue thumbnails or apply a second lossy encoding to precompressed banner assets.

Header search amendment (2026-10-27): the main search field has no category selector; keep category discovery in suggestions and the separate navigation dropdown. Hero side-card Explore actions use solid indigo/white contrast; the first-bid card uses a white bordered surface beside the yellow deals card.

Homepage section amendment (2026-10-27): remove the home category tile row, affordable rail and Next to close rail. Keep Closing now on a white surface with indigo heading and yellow countdowns, then Top deals. A sparse rail keeps the same card widths as a populated rail, aligned left; never stretch one to three cards across the container. Hide scroll arrows when everything fits and hide Closing now when no genuinely imminent lots exist. This supersedes the earlier home order and indigo Closing now band.

Homepage onboarding amendment (2026-10-27): place the signed-out three-card guide directly below the hero and before Closing now. Use Sign up & top up, Bid & win, Pick up & repeat. White bordered cards contain concise factual copy, indigo/pale-indigo/yellow instructional panels and real action links; stack on phones. This replaces the previous lower-page slim guide, avoiding duplicated instructions and unsupported savings/activity claims.

Onboarding card refinement (2026-10-27): owner-selected title case Sign Up & Top / Bid & Win / Pick Up & Repeat, bold 800-weight promotional headings and 32 px outer card corners. Remove visible numbering and the three action links. This narrowly extends the standard radius hierarchy through the shared promotion token; other components retain their existing shapes.

Onboarding artwork amendment (2026-10-27): replace the inner instructional panels with owner-supplied guide-1/2/3 images from public/banners, displayed whole with responsive sizing. Retain headings, descriptions, rounded outer cards, signed-out placement and reduced-motion-aware hover feedback.

Image-only guide amendment (2026-10-27): owner requests only the three supplied guide images below the hero, without the separate section title, headings, descriptions or trust lines. Preserve accessible full-text alternatives, responsive whole-image rendering and hover feedback. Prefer AVIF with WebP fallback, lazy loading, intrinsic dimensions and content-hashed caching for low-data connections.

Item-card condition refinement (2026-10-27): Like new uses solid green, Open box solid indigo, Damaged solid danger red, and a verified Instant win indication uses yellow. Condition text remains visible. Item-card countdowns include seconds, use server-aligned time, and show reconnection rather than stale time. Instant win is display-only preparation until an authoritative catalogue field and business rules exist.

Home deal actions (2026-10-27): omit pickup location text from item cards, keeping it on lot detail pages. Top deals cards have a persistently visible Bid now button. Its See all link has indigo hover/focus feedback with reduced-motion support; a centred See all auctions action beneath the rail opens the populated Search auctions browser. Empty searches list open catalogue lots with existing filters and cursor pagination.

Home deals refinement (2026-10-27): the bottom action uses the owner's exact label "See All Auction". Show four Top deals cards per desktop rail viewport, including large monitors; retain existing smaller-screen counts. Reveal Bid now on card hover or keyboard focus on fine-pointer desktops, matching catalogue behaviour; keep it visible on touch devices. This supersedes the previous persistently visible desktop action. Updated owner guide artwork retains responsive AVIF/WebP delivery with new content-hashed URLs.

Item-card readability amendment (2026-10-27): use the exact owner action "Sell All Auctions", at least 60 px tall. Remove percentage badges and visible Starting bid labels from item cards; retain accessible price labels. Condition badges move top left with rounded corners and bold uppercase text (LIKE NEW, OPEN BOX, NEW, DAMAGED), preserving established condition colours. Titles are 17 px/700 and at most two 24 px lines; prices 26 px/800; countdowns 18 px/800 on a separate prominent line. This narrowly supersedes sentence-case badges and earlier card type sizes. Maintain authoritative live data, urgent colours, desktop hover/focus bid actions and touch visibility.

Card metadata refinement (2026-10-27): UNTESTED is yellow/ink. Timer and bid count use separate rounded badges on one row, timer left and bid count right with an 8 px gap. Timer uses solid indigo/white by default, yellow/ink for urgent and red/white for final time; bid count uses a light bordered badge. Narrow cards use compact type to preserve alignment, wrapping only when necessary. Top Deals uses bold title case, no subtitle, and a bordered See all action with solid indigo/white hover and keyboard focus feedback.

Mobile app banner refinement (2026-10-27): contained 320 px indigo banner, strong concise headline, official App Store and Google Play badge artwork with prominent Coming soon status. The generic phone stands upright and shows the real mobile auction website, explicitly labelled Mobile web preview until T14 ships. Store badges are informational, not dead download buttons. A real web browsing link remains available. Provider trademarks are the owner-requested exception to Lucide-only interface icons.

App banner correction (2026-10-27): owner rejected the wide empty middle and miniature website screen. Keep copy and device together in a centred composition with a bounded gap. Use a legible app design preview, built from shared HTML/CSS, existing credited product photos and Lucide icons, with branded header, search, product cards and navigation. Label App design preview and keep Coming soon; no fake live values or release claims. This supersedes the screenshot-based phone direction.

Simplified store banner (2026-10-27): owner removes the phone and all extra app/preview/coming-soon labels and browsing link. Use only a broad headline, short line and clickable official store badges in a compact indigo band. Desktop spreads copy and badges across the container; smaller widths stack them with deliberate spacing. Current destinations are general store homepages pending actual LotVanta listing URLs; never invent an app listing.

Home closing emphasis (2026-10-27): banner copy is "Stay close to your next win" with the approved outbid-alert/favourite-auction supporting sentence. Closing now and Top Deals both show four cards on desktop. Closing now heading uses weight 800. Home countdown badges are red/white, 20 px/800 (16 px on narrow cards), keeping bid counts separate on the right. This supersedes earlier timer colours on home only; server time, stale-data safeguards and closing eligibility remain unchanged.

Live catalogue amendment (2026-10-27): countdowns are blue above 20 minutes and red at 20 minutes or less, without yellow. Every imminent home lot belongs only to Closing now; Top Deals excludes the entire imminent set, including overflow beyond the closing rail's selection limit. Recompute sections against server-aligned time every second; apply live end-time extensions and silently refresh catalogue metadata every 15 seconds while visible, plus focus/reconnect and debounced live updates. Remove elapsed/terminal cards from active listings without a page reload. Never substitute a stale starting price for a failed live price; preserve reconnect safeguards. Final auction status and settlement remain server-owned.

Home FAQ amendment (2026-10-27): app banner headline fits one line on desktop, with balanced phone wrapping. Follow the app-download banner with a contained dark-ink FAQ panel, promotion-radius corners, centred bold title, separated question rows and yellow Lucide chevrons. Use native accessible details/summary, 44 px minimum targets, clear focus and one open answer at a time. Content must describe existing LotVanta behaviour without invented security or savings claims.

FAQ surface refinement (2026-10-27): replace the dark panel with a white bordered surface, indigo headings and chevrons, light dividers and pale-indigo hover/open backgrounds. The centred title is 40 px/48 desktop and 30 px/36 mobile, weight 800. Preserve the native accessible accordion and existing copy. This supersedes the earlier dark surface and yellow chevrons.

Lot-detail refinement (2026-10-28): two equal desktop gallery/bidding columns, stacking below 1024 px. Remove the reference/pickup subtitle; retain hover/focus breadcrumbs. Price is 36–56 px/800, with condition aligned right and an explicitly labelled retail-estimate comparison. Four large countdown segments use indigo, red at twenty minutes or less, and preserve reconnect safeguards. Guests see Join Now to Bid. Optional fixed offers use a pale-yellow surface, trophy action, auction-deadline countdown and fee disclosure before the configured pickup address. Expanding the offer retains the existing checkout. No invented savings guarantee or transferability claim.

Public item-history refinement (2026-10-28): put the friendly Item ID at the top-left of the bidding card and 44 px circular watch/share actions at top-right. Show estimate percentage in bold red. Buy Now is bold; Join Now to Bid has an ink-colour hover/focus state and restrained lift, disabled for reduced motion. Bid History uses a bordered table with bidder alias, amount, WAT date/time, newest recorded leader highlighted green with a crown, refresh and pagination. Winning Bid is public; Your Bid is disabled for guests and shows only the signed-in buyer’s requests for this item. Keep private rows scoped to the account/view during transitions. Small screens scroll the table inside its panel; never widen the page. Public rows expose only recorded prices and lot-scoped aliases, never private automatic limits or personal details.

Item gallery correction (2026-10-29): owner requests an edge-to-edge cover crop in the square detail frame, removing letterbox space and the View larger overlay. Clicking/tapping the image or pressing Enter opens a wide photo dialog showing the complete image with contain sizing, a top-right close icon and Escape dismissal. Return focus to the image trigger on dismissal. This supersedes the earlier contain-sized detail card; inspection in the popup retains the full photo.

Item information layout (2026-10-29): sticky desktop gallery under the compact header, bounded by the detail grid, and one page scroll; static gallery at tablet/phone widths. Right column after Pickup location: Description (open), public/personal Bid History, Condition (open), Pickup and delivery (expandable). History uses ten rows per cursor page with Previous/Next; Similar items spans the full container below the columns. Only empty DEMO-prefixed lots may show a clearly labelled 23-row read-only history preview, without a leading-row crown or any connection to accepted bids, live prices or wallet holds. Saved history takes precedence; error and personal states never substitute sample history.

Auction-policy section (2026-10-29): open, expandable section after Pickup and delivery. Use concise labelled clauses, all five shared condition badges, real per-item Naira starting price and shared fee constants. Emphasise inspect/test before accepting and removing goods, with a restrained bordered no-returns-after-collection callout. Align Help and draft Terms from shared collection wording; preserve applicable statutory rights and separate financial refunds. Do not claim universal starting prices, no reserves, card-on-file charges, transfers or unapproved collection/restocking deadlines.

Deals browsing refinement (2026-10-29): All Deals, Top Deals, Ending Soon and category listings use a large 48–104 px/800 title (38–60 px on phones) and an oversized section-specific Lucide icon. No auction count or generic description. Below, pill-shaped Current bid, Auction ends and Condition controls open native checkbox fieldsets with 44 px rows, visible selected-option counts, hover/focus feedback, Escape and outside-click dismissal, and menus kept inside the viewport. This is the owner-requested pill-radius exception. No pickup selector or Apply button. Multiple selections use OR within each group and AND between groups; debounce automatic reads, retain shareable URL values, reset pagination on edits and provide Clear filters. Current bid and end windows use authoritative live state, including soft-close extensions. Preserve reconnect/error states, 24-item cursor pages, server-aligned expiry and public pricing. Text-search remains separate.

Deals artwork/options amendment (2026-10-29): the owner's three supplied transparent PNG illustrations are the explicit decorative-image exception for All Deals, Top Deals and Ending Soon headings. Serve reproducibly generated WebP copies (roughly 8–10 KB); preserve original PNGs. All three headings use matching 40–64 px/800 uppercase text, an owner-approved sentence-case exception. Selected checkbox rows use pale green with dark-green text/ticks; Clear filters is red. Price options: Under 30,000 Naira, Under 100,000 Naira and 100,000 Naira and above, preserving their requested overlap. End options: Within 1 hour, Ends today, Ends tomorrow; Nigerian calendar boundaries govern today/tomorrow. All conditions start selected, Clear restores them, and a deliberate empty condition selection stays empty on reload. Existing section eligibility remains unchanged.


Buyer portal amendment (2026-10-29): signed-in account routes share a 264 px sticky white sidebar and a flexible content column inside the marketplace container. Use a yellow Check-in action, indigo available-balance tile, Lucide navigation, restrained hover/active states and a collapsible desktop sidebar with a scrollable short-viewport panel. Below 1024 px use an expandable My account menu. Balance has one prominent spendable amount, a smaller reserved-for-active-bids explanation and expandable total/available/reserved details. Keep Buy Now purchase history separate from auction bid history; paid pickup orders alone appear under Awaiting pickup. Never show invented rewards, referral earnings or delivery availability.


Buyer profile/authentication amendment (2026-10-29): Profile contains Full name, read-only Email address with a visible verified tick, optional Phone number and Full address, then a separate Change password panel. Keep account details in shared white panels and use existing form tokens. Signup collects name/password before email proof; login checks email/password before the code step. Provide Forgot password for recovery and existing buyers setting their first password. Explain that changing passwords signs out all devices. Never expose verification codes, passwords or password hashes in screenshots, logs or public activity. Recovery success directs back to login.


Authentication polish (2026-10-29): replace the auth product-photo collage with a solid indigo editorial panel, a large concise headline, fine divider and three factual icon-led statements; no photos, fake metrics, gradients or repeated feature cards. Use a readable form column on the light canvas, a full-width contained desktop layout and top-aligned single-column forms below 1024 px. Back to auctions uses pale indigo with solid indigo hover/focus. Every buyer password field has a labelled 44 px show/hide eye button. Email codes use six separately focusable, numeric inputs with complete-code paste/autofill, arrows and backwards deletion; each box has a visible focus state.


Auth error banner correction (2026-10-29): show authentication and field-validation errors at the top of the form, before inputs, on a solid danger-red surface with white text, alert icon and 44 px close button. Auto-dismiss after ten seconds, pausing while hovered or keyboard-focused. Preserve field values, announce through role=alert and scroll into view without stealing focus. Do not bury errors beside the submit button.


Reset eligibility correction (2026-10-29): keep Reset your password on the email step when the address is invalid, unregistered, inactive or unavailable for buyer recovery. Show the top red error banner; do not reveal code or new-password fields on rejected requests, delivery failure, network failure or rate limits. Advance only after the API accepts an active buyer and dispatches the code.


Watchlist counter amendment (2026-10-29): remove the signed-in header wallet amount/top-up chip, keeping Balance in the account dropdown and portal. Add compact yellow/ink count badges to the header heart and both Watchlist menu entries, including zero when confirmed; show 99+ visually above 99 while accessible labels retain the exact total. Keep the badge visible in a collapsed desktop sidebar and omit unavailable counts. Remove only the Profile recovery link below Change password; preserve first-password setup where needed.


Watchlist amendment (2026-10-29): Watching, Won and Lost contain saved lots only. Use bordered horizontal image/content cards on desktop, stacked on phones: title, Unwatch, fresh live price with optional retail estimate, server-offset countdown, actual pickup name/address and bid amount plus Bid now. Bid now opens the existing fee review with that amount. Archived cards have confirmed outcome/final price and no bidding controls; unsold items say Ended unsold, unresolved closures say confirming result. Ten-row cursor pages, silent fifteen-second outcome reconciliation, offline/error/empty states and authoritative watch-count invalidation remain required.


Watchlist polish (2026-10-29): scope tab hover/focus and solid indigo selection to the Watchlist. Countdown badges are bold white on indigo, red inside the existing twenty-minute closing window. Unwatch uses the shared danger button. Show Previous/Next, current page and ten items per page for all three tabs, with unavailable directions disabled. Honour reduced motion and retain 44 px targets.


Payment return/input correction (2026-10-30): wallet Amount to pay uses numeric keyboard and digits-only controlled edits, retaining blank clearing and rejecting mixed paste without silently changing the number. Keep other bid input behavior. A protected, restrained payment-status page shows verification/loading, retryable errors, pending and API-confirmed success, with a clear Back to balance or Purchase history action. Never claim success from query strings or redirect alone.


Wallet funding/status amendment (2026-10-30): distinguish One-time bank transfer checkout from personal transfer account setup. Show fee and net credit before the explicit pay action. Background wallet refresh must retain the loaded screen, input, quote and scroll; report failed refresh as last-confirmed values rather than blanking the page. Payment confirmed/failed uses a bold 32px heading with a large Lucide check/cross; pending uses a clock. Back to balance is an indigo filled action with visible hover/focus and reduced-motion support.


Wallet simplification (2026-10-30): Balance shows the wallet summary, Add funds with one-time transfer and card options, funding history and wallet activity. Omit personal transfer-account display/setup and BVN/bank-detail collection. Keep earlier transfer receipts visible, retain fee disclosure and silent refresh, and preserve the responsive shared-component layout.


Wallet workspace amendment (2026-10-30): balance and Add funds form share the desktop top row, stacked on phones. Put Check pending payment below the balance and show its results in an accessible closable dialog. Fee preview uses a filled indigo action. Transactions span the whole content column with Funding history and Wallet activity tabs, WAT dates, explicit gross/fee/net columns and bounded cursor navigation. Tables scroll inside the panel on phones. Payment-method choices render locally on first opening with native radios, keyboard control, outside dismissal and Escape. Balance refresh failures use a persistent red banner above the cards with Retry; history failures stay in their own panel. Retain last-confirmed snapshots and form values during background reads. Sidebar and summary amounts shrink to fit one line without truncating money.


Buyer action-feedback amendment (2026-10-30): item-detail bid/watchlist outcomes use a dismissible fixed green success or red error toast, with icons, white text and a 44px close action, constrained to the mobile viewport. Keep uncertain bid errors inside the open confirmation dialog with the same red treatment and the existing safe Retry this bid action. A live leading state uses a full-width bold white-on-green banner, never a small text-only badge. Sidebar balance icon moves to the top-right so the amount spans the full tile width; summary horizontal padding is 20px, with measured single-line amounts retained. Do not replace genuine read failures with optimistic balances or hide uncertainty.


Purchase/notification feedback amendment (2026-10-30): Buy Now and payment-return outcomes use dismissible fixed green success, red error and indigo pending/information banners. Only server-confirmed paid/credited responses receive success wording. Late wallet credit explicitly says the item was not purchased. The signed-in bell shows a red white-text unread count (99+ visually, exact accessible count), a separate Awaiting pickup link/count and highlighted unread result rows with WAT timestamps. Keep ten-row cursor pages, mark-displayed-as-read, retry/loading/empty states and silent updates without blanking content. Opening a notice acknowledges it without changing its order. Keep the menu inside 16px mobile gutters and bounded vertically.


Closed-lot amendment (2026-10-30): replace the live bid/countdown form with a bordered Auction closed result panel after authoritative closure. Use a bold green Sold status and large indigo paid final price, or honest unsold/confirming-result wording. Keep item ID, watch/share, description, recorded history and pickup links. Remove bid controls and fixed-price offers; retain pending purchase feedback internally so success messages survive closure. Never show Reconnecting for a confirmed closed result or invent a winner from a clock. Real open-auction outages must still disable stale bidding.


Awaiting pickup refinement (2026-10-31): one full-width bordered white list, aligned Order / Payment / Amount / Collection columns on tablet/desktop. Show actual order reference/date, white-on-green Paid badge with tick, bold Naira total and an explicit pickup-pass link with hover/focus. On phones stack each order into two columns and omit the decorative receipt icon so references stay readable. Ten-order cursor pages with Previous/Next, page number and disabled boundaries. Preserve authenticated private pass routes; no invented pickup metadata or changes to collection eligibility.


Invoice detail refinement (2026-10-31): present a white branded invoice document with indigo top rule, invoice reference/date, confirmed payment badge, current buyer account details clearly labelled as such, semantic item/line-total table, recorded fee breakdown and bold total. Line totals explicitly include allocated charges. Back to awaiting pickup sits left and Print / Save as PDF sits right, wrapping on phones. Use native printing with A4 margins; hide marketplace navigation, sidebar, toolbar, cookie notice and collection action in print. Keep private QR tokens out of the invoice document. Do not invent legal business/tax details or recalculate recorded charges.


Check-in availability amendment (2026-10-31): hide the yellow sidebar Check-in action until arrival handling and its staff queue are implemented. Use a quiet My account sidebar heading instead. A protected old /check-in URL shows an honest availability notice and View awaiting pickup link; it must not duplicate invoice listings or pretend to notify warehouse staff. This supersedes the earlier sidebar Check-in presentation rule for now.


Working Check-in (2026-10-31): restore the yellow Check-in sidebar action now that arrival registration and the staff queue exist. Separate Check-in from invoice browsing: Your arrivals shows location, WAT arrival time, yellow Waiting for staff or green Acknowledged by staff and private pass link; Choose a pickup order has paid order references and explicit Check in actions. Confirm physical arrival in a dialog before posting, preserve the same request key on uncertain retries, and show green success/red errors. Warehouse/admin Pickup arrivals shows buyer name, order reference, location/time, Acknowledge arrival and confirmation before Close visit. State clearly that closing a visit is not collection. Ten-row cursor pages and silent 15-second refresh retain existing content; stale/error/offline reads disable new mutations. Stack rows naturally at 360px. This replaces the unavailable Check-in notice.


One-pass pickup redesign (2026-11-01, owner approved): Check-in shows one private pass per buyer/centre, not arrival/order tables. A centred high-contrast QR and readable eight-character code sit beside centre name/address and a short privacy note; server-expired passes offer Refresh pass. After staff scan, replace the QR with Checked in; after handover show Collection confirmed and keep remaining items accessible. Staff desk has a scan/code field, optional browser camera, compact visit queue and a paginated item checklist with friendly item/order references. Select or scan only actual handover items; final confirmation records them and completes the visit by default. No separate Acknowledge/Close visit in normal collection. Optional continued batches and reasoned cancellation handle exceptions. Green success/red errors, same-request retry after uncertain confirmation, silent fifteen-second snapshots, 44px controls and 360px layouts remain required. QR screenshots in documentation must use synthetic fixtures; production passes/codes are masked in e2e captures.


Purchase history refinement (2026-11-01): Buy Now orders use one full-width bordered list with friendly references, WAT dates, actual coloured payment badges, bold recorded totals and explicit View invoice actions. Use responsive two-column phone rows, ten-row Previous/Next pagination and silent owner-scoped refresh retaining rows on errors. No invented item photos or collection state from summary-only data.


Buyer Bid history refinement (2026-11-01): full-width shared workspace; All/Winning/Outbid/Won/Lost/Cancelled tabs with pale-indigo hover, solid-indigo selected state, clear focus and keyboard navigation. Aligned image/title/reference/date, historical direct bid or private limit, coloured result badges and View item action; responsive phone rows and ten-record Previous/Next navigation. Preserve current-page status filters/latest-item grouping with explicit scope copy, live socket positions and silent owner-scoped refresh. No fake global counts or current-price claims.


Bid card Live cue (2026-11-01): group the position badge with a small yellow Live badge using the existing two-second breathing dot. Text remains steady and reduced motion stops the dot. Only current online socket data with a future server-adjusted deadline may display it; persisted outcomes and reconnecting/expired snapshots must not imply a live auction.


Buyer navigation readability (2026-11-01): use weight 700 for every Bid history tab and All categories/All deals/Top deals/Ending soon navigation label. Buyer account dropdown entries retain their text and use consistent decorative 18px Lucide icons, 44px targets, watch-count placement and existing dismissal/focus behaviour.


Buyer profile refinement (2026-11-01): compact initials/name/email header and genuine Email verified badge, then separate Personal details and Change password surfaces with restrained Lucide section icons. Two-column fields on tablet/desktop, stacked on phones; read-only email is muted, address is multiline, actions are indigo filled with hover/focus. Green save success/red errors are dismissible and keep failed drafts. Preserve password visibility, logout warning and existing authentication requirements. Never overwrite unsaved profile edits during background updates.


Account authenticator amendment (2026-11-01): add a compact shared Profile security card with explicit enabled/required status, recovery-code count and filled actions. Use accessible password -> six-box email -> authenticator/recovery dialogs. Render buyer setup QR locally with manual-key fallback; require explicit saved-code acknowledgement and offer a private text download. Keep setup/recovery secrets out of persistent browser storage and screenshots. Staff has replacement/recovery controls with a mandatory-policy explanation, never a disable action. Preserve red errors, green confirmation, narrow-screen wrapping, keyboard focus and 44 px controls.

Support conversation lists (owner refinement, 2026-11-01): compact full-width rows across All, Open, In Progress and Resolved. Bold two-line subject and muted SUP reference on the left; status badge and last-updated date/time in Africa/Lagos on the right. Wide inboxes align metadata horizontally; narrow inboxes stack time beneath status. Keep buyer/assignee context in staff rows. Use dividers, restrained hover feedback, an indigo selected edge and visible keyboard focus; retain cursor pagination and whole-row chat opening.

Signed-in bid entry amendment (owner-approved 2026-11-01): remove the three suggested-price buttons and the bidding-method dropdown. Use a native radio group above the custom Naira amount, default Bid full amount and explicit Automatic spending limit. Place Bid now/Set limit beside the input even at 360 px; preserve the fee review before confirmation. Entered bids may be any integer kobo amount strictly above current price, or at least the starting price before the first bid; automatic counterbid steps remain unchanged. Mobile Enter bid focuses the custom field without replacing its value. Keep floating support controls above the sticky bid bar.

Bid form styling refinement (owner-approved 2026-11-01): place method radios side by side on wide desktop screens, with compact pale-yellow guidance. Use bold smaller minimum labels and larger minimum amounts. Bid input and icon-led primary action share equal-width columns; reject non-numeric input while retaining two decimal kobo places. Give estimated total a pale-indigo surface and a read-only Fee details dialog. Use a bold compact yellow shortfall notice and filled wallet action only when the entered bid has insufficient funds; remove them after a successful sufficient-balance refresh. Do not alter fee or auction rules.


## Upcoming Deals and pre-bids (2026-11-02)

Keep scheduled stock in Upcoming Deals after Ending soon in navigation, separate from live browse/search. Reuse the shared container, responsive catalogue grid, product photos and condition badges. Show WAT launch date/time and an indigo segmented launch countdown that fits within narrow cards; reserve red countdowns for live auction closing. Detail pages explain private automatic limits and show the maximum plus all fees before confirmation. Signed-out visitors sign in to pre-bid. Owners can review edits or cancel before launch, with clear coloured feedback and exact-request retry when the outcome is uncertain. Refresh silently on focus/online and every five seconds; replace the pre-bid panel with live bidding when the server opens the lot. Staff scheduling uses WAT inputs, an audit reason and explicit reschedule/cancellation disclosure; lock uncertain request fields until retry resolves. Preserve accessible dialogs, touch targets, reduced motion and all privacy/eligibility rules.


### Staff-approved bid cancellation (2026-11-02)

Keep accepted-bid commitment and Bid now visible until cancellation completes. A red review action opens a reason and explicit fee-consent dialog; requesting review is free. Show the pinned percentage and public-price-at-approval basis. Admin quotes show the actual fee and leader/non-leader effect before a filled red confirmation. Pending retries preserve inputs and key; completed, failed and consent-required states remain distinct. Cancelled buyers see a clear warning with bidding disabled. Use shared tokens and responsive controls; screenshots: docs/design/paid-bid-cancellation/README.md.


### Personalised buyer homepage (2026-11-02)

Keep the promotional hero and image guide for signed-out visitors only. Signed-in buyers see a compact first-name greeting and filled-tint Watchlist/My Bids shortcuts, aligned to the shared container. Show Closing Now first, four Ending Soon cards by closing time, admin-selected Top Deals, and up to four upcoming cards with launch countdowns. Use existing card/rail tokens, four columns on desktop and responsive mobile layouts. Do not repeat live lots across sections; hide empty sections. Preserve silent socket/catalogue reconciliation, visible error/retry states and no promotional flash while session restoration is pending. Normal sign-in returns home; explicit safe item/checkout destinations take priority. Screenshots: docs/design/buyer-home/README.md.


Homepage row amendment (2026-11-02): all homepage grids and rails show four cards across from 768 px when stock exists. Preserve readable mobile grids/scrolling rails below 768 px. Header Watchlist and notification bell share the bordered 44 px rounded control and indigo hover/focus feedback; notification count remains visible.


## Mobile home and launch refinement (2026-11-02)

Owner-approved T14 redesign: keep one compact white wordmark/search header, with watchlist and notification actions; remove the duplicate page-title bar. Use a short indigo/photo promotion for signed-out buyers, a personal greeting for signed-in buyers, and four compact auction shortcuts. Product-led collections retain current server eligibility, section windows and non-duplication rules. Two-column phone grids and four-card tablet grids use legible prices, two-line names, condition badges and segmented photo countdowns. Fresh socket snapshots control current prices; never style an old catalogue price as live. Hide empty collections and retain loading/offline/error/retry states.

Launch uses the existing Schibsted Grotesk text wordmark on shared indigo, with yellow NG and a brief Bid. Win. Save. line. Wait for fonts without an artificial delay. Generate raster wordmark/colour configuration from shared tokens; use the approved Expo splash plugin in installed builds. Expo Go's native launcher is outside this visual acceptance; review the app-loading composition separately and verify the true native splash in a release APK.

Mobile launch refinement (owner requested, 2026-11-02): edge-to-edge indigo canvas, thin yellow top rule, restrained outline rings and a Lucide Gavel auction illustration on a yellow tile above the existing wordmark. Keep Bid. Win. Save. and three loading dots near the bottom. Allow a 450 ms gavel reveal, 1.2 s breathing cue and 200 ms exit; respect native reduced motion and stop animation on unmount/error. Startup remains readiness-driven with no minimum display timer. The installed native splash is static and uses the matching bundled illustration/wordmark; animation begins when React Native is ready. The gavel is an illustration, not a replacement logo.

Mobile home polish (owner requested, 2026-11-02): use compact white wordmark/search navigation, a short signed-out photographic promotion without a duplicate introductory heading, circular shopping shortcuts and quiet tinted See all actions. Product names use 13/18 px semibold with a two-line cap; current prices stay bold at 20/26 px, with struck-through retail estimates wrapping naturally. Fit exactly two cards across phones and four from 768 px with shared gutters. Retain condition/watch badges, segmented timers, private-session greeting, empty/error/offline states and fresh-price gating. This smaller title rule applies to native home cards only.

Mobile navigation/countdown correction (owner requested, 2026-11-02): use a distinct indigo bottom tab bar with yellow selected state, labels below icons, 64 px content height plus the real bottom safe area and a minimum 12 px bottom inset. Show Home, Browse, Watchlist, Login and More; Login becomes Account when authenticated. Keep Wallet in More and retain protected destination gates. Fit labels without abbreviating Watchlist. Reuse one indigo segmented day/hour/minute/second auction countdown on Home, Browse, Upcoming Deals, Watching and detail pages; detail digits are larger, and only fresh live lots inside the shared closing window turn red. Preserve explicit ended, upcoming-launch wait, clock-sync and reconnecting states. Do not alter private pass expiry text or auction/payment rules.

Mobile home shortcuts (owner requested, 2026-11-03): retain the two-column phone product grid and four columns from 768 px. Replace the bare shortcut circles with compact indigo/yellow/tinted icon tiles, complete two-line labels and 88 px minimum width that grows with system text. Expand to fill a wide row; use horizontal scrolling and a measured-overflow Swipe to explore hint when content does not fit. Preserve navigation destinations and signed-in My bids. Native visual acceptance remains pending host disk space; see docs/design/mobile-shortcuts/README.md.


Mobile hero refinement (2026-11-03): signed-out Home combines the existing photographic promotion and first-win guide in a two-slide indigo carousel. Keep controls in a separate bottom row with 44 px targets, active slide indicators and pause/resume. Swipe or manual selection pauses autoplay; background, unfocused Home and reduced motion stop automatic movement. Remove the duplicated bottom guide. Upcoming uses a filled indigo tile with yellow icon and white label. Existing signed-in greeting and product grids remain unchanged.


Mobile Browse correction (2026-11-03): show All Deals, Top Deals, Ending Soon and Upcoming in one horizontally scrollable collection row. Upcoming reads the scheduled catalogue and uses launch countdowns; keep scheduled lots out of live results. Browse/Upcoming card names match Home at 13/18 px semibold, two lines.


Mobile lot-detail refinement (2026-11-03): manual full-width paged photos with previous/next controls, image count and tap-to-enlarge; preserve data-saver photo opt-in and cache only nearby images. Signed-out Join now to bid uses green/white to differ from the indigo timer. Description, history rows and condition/policy reading copy use 14/21 px; history has pale-indigo background. Show all shared condition grades as coloured badges, keeping the actual lot condition explicit.


Mobile condition badge palette (2026-11-03): New uses deep green/white, Like new light green/dark green, Open box indigo/white, Damaged red/white and Untested yellow/ink. Keep the shared condition-badge palette and reusable native badge consistent across Home, Browse, Upcoming and lot detail/policy grades. This supersedes identical New/Like new fills.


Web condition palette alignment (2026-11-03): reuse the shared UI condition palette on all web ConditionBadge instances and listing cards: New deep green, Like new light green/dark green, Open box indigo, Damaged red and Untested yellow. Responsive colour checks/captures: docs/design/web-condition-colours.


Mobile authentication refinement (2026-11-03): full-width password fields reserve an internal 44 px eye control; never put the eye beside the field. Use a restrained pale-indigo heading and full-width white form surface. Hide account tabs in password recovery and all verification steps. Sign-in shows credentials, email code, then only the authenticator/recovery step when the server requires it; never render email and factor inputs together. Clear abandoned credentials/factor inputs when restarting; keep native secure session storage and server checks unchanged.


Mobile guest More refinement (2026-11-03): signed-out More opens a compact bottom sheet over the current tab, with App settings, configured email and external How LotVanta works/FAQs/Privacy/Terms links. Do not show private account navigation or push registration to guests. Keep App settings native, with data saver available signed out and security/auction alert controls gated by sign-in. Display actual app version/native build (never Expo Go build) and copyright. Retain accessible close/back handling and 44 px targets.


Mobile keyboard visibility correction (2026-11-03): shared scrollable Page forms resize around the keyboard, keep the focused field visible after keyboard/layout/focus changes and leave a 16 px gap above it. Use one KeyboardAvoidingView plus explicit native focus scrolling, without duplicate automatic keyboard insets. Preserve taps on form controls and allow drag-to-dismiss. Installed Android builds use resize keyboard mode; Expo Go uses its own native window configuration.


Mobile keyboard follow-up (2026-11-03): first fix was rejected on the physical phone. Replace content-relative scroll responder/KAV calculations with screen-coordinate input/viewport/keyboard measurements and actual overlap padding. Preserve a 16 px field gap, avoid double space on resized Android windows, remeasure after modal layout settles and wire auth field focus explicitly. This supersedes the immediately preceding keyboard implementation rule; device acceptance remains pending.


Mobile dynamic keyboard focus (2026-11-04): Android authentication opens as a normal full-screen stack card, avoiding native modal keyboard/window offsets. On keyboard appearance and each new field focus, position the active input toward the top of the visible scroll area with 32 px for its label; retain measured overlap padding and the 16 px visibility safeguard for later layout changes. Read existing keyboard metrics when mounting and listen to both will-show/did-show. Reopen the authentication route after changing native presentation; physical visibility acceptance remains pending.


Mobile keyboard resolution (2026-11-04, owner confirmed): use the built-in KeyboardAvoidingView around the scrollable form, padding on iOS and height on Android, with the measured header/safe-area offset. The inner ScrollView has flexGrow content, tap-outside/drag keyboard dismissal and focus reveal after keyboard/layout changes. Remove custom overlap padding from the runtime path. Owner confirms password and confirm-password are both visible while typing after fully reloading Expo Go. This supersedes the earlier custom overlap/top-position implementation rules.


Mobile full-field keyboard clearance (2026-11-04): owner clarifies that the prior apparent success exposed only the top half of the password field. Keep built-in keyboard avoidance, but include the actual input height plus 32 px when revealing focus. Add two touch-target heights of scrollable footer space only while the keyboard is visible, allowing the final signup field to clear the keyboard. Verify the entire textbox and bottom border, not just its label/first line; the prior visibility acceptance is superseded.


Keyboard clearance acceptance (2026-11-04): after the full-field clearance correction, owner explicitly confirms both complete password textboxes, including their bottom borders, are visible above the keyboard. Keep this measured input-height clearance and keyboard-only scroll space.


LotVanta identity (owner approved, 2026-11-04): use the supplied horizontal logo from apps/web/public/img/logo.png and lv-icon.png as the favicon/app-icon source. This replaces the earlier temporary text-wordmark rule. Keep the existing marketplace colours, font, components and auction behaviour; the supplied logo artwork is approved as-is. Generate lightweight web/admin logos and icon sizes with pnpm brand:generate; bundle native assets for offline startup. Give the dark lettering a white backing on dark footer/launch surfaces. Web, staff, mobile, email subjects/content, invoices, notifications and new authenticator labels use LotVanta. Historical screenshots and existing stored messages are historical evidence, not active branding.


LotVanta web logo sizing (2026-11-04): remove the legacy wordmark-dot style/decoration. Buyer/auth header logo scales to 240 px on desktop and fits available space beside phone account controls without overlap. Footer logo scales from 220 to 280 px, capped by its column width. Preserve the supplied 3:1 proportions, intrinsic image dimensions and dark-footer white backing. Responsive review: docs/design/lotvanta-logo-size/README.md.

Closing window amendment (2026-11-04): owner changes Closing Now to the final 30 minutes inclusive, superseding previous 20-minute rules. Web and mobile use the shared merchandising threshold for red countdowns; Top Deals excludes the same window. Longer countdowns remain indigo. Silent updates, expiry removal and deadline extensions remain unchanged. Evidence: design/home-live-thirty-minutes/README.md.

Mobile LotVanta launch amendment (2026-11-04): use the supplied LV icon on the native indigo splash and above the bundled LotVanta wordmark in the React Native launch screen. Owner explicitly requests a visible introduction: keep the app overlay for at least 2.4 seconds after its logo loads, then dismiss only when session restoration is ready; retain the existing brief reveal/breathing dots/fade. Honour reduced motion without bypassing the display time. Block touches to underlying screens while the overlay remains. This supersedes the earlier no-minimum-delay launch rule. Installed native branding requires a new APK; Expo Go's own initial launcher cannot be replaced by JavaScript.

Mobile launch polish correction (2026-11-04): remove the white-backed horizontal source logo from launch surfaces. Use a transparent circular LV viewport (the supplied raster has opaque black corners), with a transparent Schibsted LotVanta name in white/yellow below it. Keep web/footer artwork unchanged. Move Bid. Win. Save. into the central identity group at title size/800 in yellow. Use a 650 ms scale-and-lift entrance, delayed tagline reveal, gentle icon breathing and loading dots; preserve reduced motion and the 2.4-second minimum. Native splash remains static and uses the transparent LV asset; APK rebuild required. Physical-device animation/splash acceptance remains pending.

Mobile launch edge/tagline correction (2026-11-04): circular clipping alone left black source pixels inside the visible perimeter. Remove neutral black backing before/after scaling and use the cleaned artwork for native app and splash icons. Use the complete bold yellow slogan as one transparent, contain-scaled asset with full accessibility label and width capped by available space. Keep existing animation and minimum visibility. Supersedes the earlier native Text tagline rule. APK rebuild required for embedded assets; physical visual acceptance remains pending.

Mobile sparse Closing Now amendment (2026-11-04): a single closing item spans the inner home rail; two or more use existing responsive card widths. Timer ticks should update countdowns without rebuilding unchanged product cards. Shared form scrolling delegates swipe handling to ScrollView while preserving the accepted keyboard-field clearance. Physical-device scrolling/keyboard regression review remains pending.

Mobile Account/More navigation amendment (2026-11-04): More always opens the same informational app-settings/help/legal/email/version sheet for guests and buyers. Login becomes Account when signed in and opens the buyer menu with Check-in, Wallet, Awaiting pickup, Shipments, Watchlist, Purchase history, Bid history, Profile/security, Customer Service and Sign out. Retain existing route guards and settings access.

Bidding action UI amendment (2026-11-04): Bid Now and Buy Now use shared winning-green/white action styling across mobile/web, with hover/press and disabled feedback. Retain indigo for unrelated navigation and yellow for offer/badge backgrounds. Mobile Bidding method opens an inline, scrollable-with-page radio option list directly below the trigger; selecting an option closes it. Its explanatory warning uses 14px secondary text. No pricing or bidding rule change.

Mobile bidding dropdown correction (2026-11-04): use a floating menu visually anchored to the selector rather than expanding the form. The native transparent modal renders above bottom navigation with no dimmed backdrop; list width matches the field, options have 44px minimum targets, selected tint/checkmark and the trigger chevron reflects open state. Prefer below-field placement, flip above when needed and scroll within safe-area bounds. Close on outside tap, Android Back, selection and orientation change. Retain compact explanatory warning and existing bid rules.

Mobile bidding type-size refinement (2026-11-04): dropdown selected value/options use shared 14/20 typography; the compact bidding-method explanation uses 12/16. Preserve native text scaling and option touch-target sizes. Other notification banners retain their normal text size.

Mobile bid-review sheet refinement (2026-11-04): use compact item/photo/method context, 14px aligned fee labels and tabular amounts, an indigo total-reservation panel, plain reservation guidance and a full-width green Confirm action with secondary Edit bid. Keep controls outside the scrollable breakdown so small screens can inspect all charges without losing the actions. Preserve percentage disclosures, saved-request wording, system text scaling, close affordance and existing financial logic.

Mobile modal safe-area correction (2026-11-04): modal sheets, including bid review, measure their own safe areas inside the native Modal and keep the whole panel/footer above system navigation controls. Preserve the accepted bid-review styling and scrollable breakdown.

Mobile bid outcome feedback (2026-11-04): do not close the bid-review sheet immediately after acceptance. Replace its body with a green accepted result and check icon, current-leading status and Done action. Display failures in a red banner within the visible modal; distinguish confirmed insufficient funds, account/session restriction, throttling and unknown network outcomes. Never claim success without an accepted server response or suggest a fresh request for an uncertain result. Keep modal-safe-area clearance and existing background banners.

Mobile Buy Now outcome lifecycle (2026-11-04): closing a purchased lot must not unmount checkout feedback. Paid outcome has a prominent green check, paid amount, collection guidance and View order/Done actions; confirmation persists until dismissed. Show pending in amber, unsuccessful/unknown in red and distinguish late wallet credit from item ownership. Respect modal safe areas and prevent stale polling responses from hiding a known successful payment. No timed dismissal or automatic navigation.

Mobile activity badges (2026-11-04): show small red/white counts on home Watchlist and notification icons, bottom Watchlist tab, and corresponding Account menu entries. Show awaiting-pickup count on its Account row. Hide zero/unknown counts; use 99+ visually for large counts. Use one shared authenticated summary reader with immediate post-action invalidation and silent five-second/foreground/outbid/push refresh. Do not wait for inbox/watchlist navigation. App notification permission and Firebase readiness do not gate in-app badges.

Mobile detail badge clearance (2026-11-04): the price/status row must not push the condition badge beyond the right edge. Bound and scale the price text, reserve the condition slot, and allow wrapping when enlarged text needs another line. Keep all condition labels readable within the card.

Mobile ended detail state (2026-11-04): Ended indicator is red/white. Ended/terminal item details retain photos, condition, description and history, but hide bidding-method choices, instructions, amount/fee preview, top-up/cancellation and bid/join actions. Preserve visible result confirmations independently of auction-state changes; reconnecting is not restyled as ended.

Mobile bid-history density refinement (2026-11-04): stack bidder/time in a compact metadata column and reserve a separate right-aligned amount column. Use 12px metadata and 14px bold tabular amounts with bounded single-line auto-fit for long currency values; never shorten financial amounts to K/M. Use the same amount treatment in buyer history cards.

Mobile pre-bid action colour (2026-11-04): View pre-bid/View and pre-bid card actions use green with white text/icons, matching live bid actions.

Mobile customer service refinement (2026-11-04): horizontally scrolling, non-shrinking status tabs stretch across wider screens; Open uses indigo, In Progress yellow and Resolved green. Expanded keyboard-aware chat keeps a larger multiline message composer outside the scrolling conversation, with green Talk to support action. Sending, attachments, handoff and pagination unchanged. Targeted lint, mobile types and Android bundle pass; physical-device keyboard and visual review pending.


Mobile support action hierarchy (2026-11-04): Send message is the sole full-width composer action. Move human handoff/reopen into a compact fixed header above history; show Waiting for an agent after confirmed human handoff, Connected to support only with an assigned agent. Retain keyboard-bounded composer.


Mobile bid history polish (2026-11-04): horizontally scrollable bold status tabs; two-line compact item titles; small outcome badges separate from server-connected Live auction label; shaded aligned amount panel and green live-auction action. Detail history uses an icon heading, bidder/date and amount columns, WAT date/time, compact bold amounts and explicit loading/error states. Keep pagination and unabridged financial values.


Mobile bid-history imagery (2026-11-04): each account bid card has a cached 76px square item thumbnail beside its two-line title and friendly item number; tapping the heading opens item details. Keep amount and statuses below so long prices retain full width.


Incoming bid-history tab (2026-11-04): web/mobile share photo, friendly item number, private limit, actual reserved total, WAT launch date and server-aligned countdown. Keep Incoming reachable with no live bids. Manage opens existing item-level change/free-cancel controls. Cancelled pre-bids have separate pagination. New bids are disabled on insufficient/unknown funds; show Top up wallet only for a confirmed shortfall after fees and an eligible same-item reservation. Preserve pending-request retry controls. See docs/specs/incoming-bid-history.md.


Mobile invoice refinement (2026-11-04): purchase-history cards use compact payment badges, bold adaptive amounts and a View invoice row. Invoice detail uses LotVanta branding, friendly number, aligned date/type/currency rows, buyer name, item rows, stored fee breakdown and indigo total. Save/share PDF and Print actions precede the document. Back action returns to the originating purchase-history or pickup list. Print template uses escaped text and token colours. Pre-bid management actions are red on mobile/web, while cancelled-item View item remains indigo.


Mobile browse/account clarity (2026-11-04): Browse search uses a magnifying-glass icon, explicit readable placeholder Search by item or brand, token-based input/placeholder colours and Search keyboard action. Check-in is a rounded danfo-yellow Account row with dark text/icons.


Mobile Wallet navigation (2026-11-05): Wallet is a regular stack screen opened from Account or top-up links, not a hidden bottom tab. Preserve /wallet and provide back navigation to the caller.


Mobile wallet review polish (2026-11-05): payment-method field uses icon/title and a clear single-choice sheet with full-row radio targets and short descriptions. Funding review aligns amount paid and processing fee above a green wallet-credit total, with fixed in-sheet checkout/back actions. Withdrawal review uses a masked bank block, itemised fees, indigo wallet-debit total and in-popup password/email/2FA steps; keep focused fields above the keyboard and the action outside the scrolling breakdown.


Mobile verification clarity (2026-11-05): six-digit inputs use visible 2px slate borders, indigo filled borders and a light-indigo focused box. Withdrawal authenticator fields also have high-contrast borders. Filled styling indicates entry, not successful verification.


Mobile withdrawal errors (2026-11-05): password remains editable after rejection; verification errors stay in a red dismissible header banner outside the scrolling form. Dismiss the keyboard on failure and clear old errors when confirming again; do not require manual scrolling to discover a failed attempt.

## Staff operations dashboard — T15

Use the same Schibsted Grotesk, logo, colours and shared components as buyers. Desktop navigation is a compact indigo sidebar; warehouse-sized screens use a labelled, keyboard-operable drawer. Keep operational work in bounded white panels with clear table headers, cursor pagination, status badges and 44 px controls. Prices stay on one line with tabular figures. Use actual-data SVG charts with accessible daily-total tables; never fabricate business metrics or percentage trends. Silent polling retains confirmed rows on temporary network failure, while authorization failures clear protected content. Every destructive or financial action needs an explicit reason and confirmed success/error feedback. Archive linked history; clearly distinguish safe permanent deletion from archival.

Staff security amendment (owner approved, 2026-11-05): personal authenticator 2FA is optional for staff/admin as well as buyers, superseding the earlier mandatory-policy UI. New staff setup requests a password only. Sign-in reveals the authenticator field only after valid credentials for an enrolled account. Account security shows enable controls when off and change/recovery/disable controls when on. Do not show red setup reminders, claim a password-only session is two-factor protected, or expose a control for administrators to toggle another person's authenticator.

Staff live-notifications amendment (2026-11-05): put a bordered bell at the right of the staff header with a red unread badge (99+ visual cap). Use the shared accessible dialog for the responsive inbox, compact indigo-tinted unread cards, WAT timestamps, a Mark page read action and pagination. Keep delivery/read state independent; distinguish real SMTP delivery from local email previews. Socket signals silently update counts, metrics and tables; retain confirmed content while reconnecting and use five-second visible-tab reconciliation. Destination links respect current capabilities and open the appropriate withdrawal review, support conversation or collection/auction view.

Staff setup amendment (2026-11-05): use compact searchable category/centre records with active/archive filters, clear Edit/Archive/Restore actions, safe deletion confirmation, labelled forms and existing error/success/offline states. Stack records on narrow screens; retain 44px controls. Place a keyboard-operable initials avatar beside the bell with Profile, Account security, Preferences and Sign out, removing duplicate personal sidebar controls. Personal compact spacing never reduces action targets; reduced motion honours account and system preferences. Inventory descriptions are resizable with a 240px minimum. Audit details show aligned actor/record IDs, WAT timestamps and wrapped redacted snapshots.

Inventory navigation amendment (2026-11-05): Categories and Pickup centres belong under Inventory, alongside Items. Do not duplicate them as main sidebar entries. Use a compact responsive secondary navigation with current-page feedback, 44px targets and existing capability filtering. Highlight Inventory while any of its three pages is open.

Pickup-centre totals amendment (2026-11-05): show Items at centre and Pending pickup as two compact, readable count panels in centre rows, using indigo and yellow shared surfaces and tabular numbers. Retain confirmed counts during silent refresh/offline periods. List opening hours without unexplained per-slot capacity; editing explains the saved value as future time-window booking capacity. Configuration timestamps say Details updated to distinguish them from live totals.

Staff live-search amendment (2026-11-05): every existing staff list search filters automatically after a 250ms typing pause. Use the shared labelled search field, clear icon, 44px target and keyboard Enter support. Keep focus/caret while results change, reset pagination for a new term, wait for completed text composition and ignore stale responses. Search controls do not submit mutations.

Overview shortcut amendment (2026-11-05): put Open pickup desk in the Overview heading actions above the metrics, with a location icon and existing pickup permission check. Remove its duplicate quick-action card. Stack heading actions accessibly on narrow screens.

Collection-history amendment (2026-11-05): Pickup desk has Pickup queue and Collected items views. Show confirmed item-level handovers with buyer, centre, WAT time, staff and green collected badges in compact desktop tables/stacked mobile rows. Provide live search, ten-item pagination and silent refresh without blanking confirmed rows. Label missing legacy details instead of inventing staff or timestamps.

Check-in popup amendment (2026-11-06): supersede the Overview Open pickup desk shortcut with a yellow Check in a buyer heading action, and provide the same action at the top right of Pickup desk. Both open one shared accessible check-in dialog. Remove the beside-queue scan panel and give the queue full width. Keep errors inside the popup, restore trigger focus on dismissal, and open the buyer's checklist after successful registration. Preserve separate confirmation for item handover.

Bid-review amendment (2026-11-06): make Overview's yellow check-in action larger and bolder (18px/800, minimum 56px). Add permission-scoped Bid review with live search, ten-row pagination, item/schedule and frozen-result summaries, buyer IDs and dated accepted-bid/pre-bid histories. Explicitly distinguish recorded leaders from confirmed winners and Buy Now purchasers; keep private maxima hidden. Preserve search focus and confirmed rows during silent reconciliation. Stack detail panels and table records on narrow screens.

Staff expiry amendment (2026-11-06): an expired staff session automatically returns to the existing sign-in screen with a clear Sign in again message. Remove protected content/dialogs and stale section URLs. Normal token renewal stays silent, and a permission denial is shown as an access error rather than a false expiry.

Live monitor lot actions (2026-11-08): the row ellipsis opens an anchored keyboard-operable icon menu, with forbidden actions hidden and Cancel lot separated in red. Use a right-side Bids drawer with 25-row pagination, masked names outside Admin, compact WAT times and private-limit labels. Each modifying action opens its own reasoned dialog; extension uses 2/10/60-minute radio choices. Cancellation clearly states history/hold effects, requires a reason category and note, and adds typed confirmation in the final two minutes. Buyer timers show Paused by LotVanta on confirmed pauses; reconnecting stays distinct. Keep original run time and honest unrecorded batch/cost states. Responsive evidence: docs/design/admin-live-monitor/actions-review.md.

Staff lot-panel polish (2026-11-08): use a compact photo/reference/item header above the bid table, discrete method badges, aligned unabridged Naira values, WAT date/time and a fixed pagination footer. Do not display internal permission/audit/privacy explanations. Full lot workspace uses a two-column gallery and auction overview, separate item details and an activity timeline; stack on narrow screens. Modal headings for lot actions are 18px and item names 14px. Shared close icons are red with red/white hover/focus on web and pressed feedback on native. Extend choices are 2, 10, 30 and 60 minutes from the shared rule list.

Percentage badge return (2026-11-14): item cards show a yellow danfo "−N%" badge (ink text, 800 weight, tabular figures) beside the condition badge, accessible as "N% below retail estimate". Hidden while a live price is unconfirmed or when there is no saving. Supersedes the 2026-10-27 card line removing percentage badges; the lot page discount stays as designed.
