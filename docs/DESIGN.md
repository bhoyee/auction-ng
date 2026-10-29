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

Home LCP remains below 2.5 s under the agreed mobile profile; initial route JavaScript below 200 KB compressed. Use responsive Next images for hero assets, priority only for the first slide, lazy-load below the fold, and list thumbnails at most 30 KB. Measure against the populated photographed demo, not an empty catalogue. No weakened money, security or test rules to meet a visual target.

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

Simplified store banner (2026-10-27): owner removes the phone and all extra app/preview/coming-soon labels and browsing link. Use only a broad headline, short line and clickable official store badges in a compact indigo band. Desktop spreads copy and badges across the container; smaller widths stack them with deliberate spacing. Current destinations are general store homepages pending actual Auction NG listing URLs; never invent an app listing.

Home closing emphasis (2026-10-27): banner copy is "Stay close to your next win" with the approved outbid-alert/favourite-auction supporting sentence. Closing now and Top Deals both show four cards on desktop. Closing now heading uses weight 800. Home countdown badges are red/white, 20 px/800 (16 px on narrow cards), keeping bid counts separate on the right. This supersedes earlier timer colours on home only; server time, stale-data safeguards and closing eligibility remain unchanged.

Live catalogue amendment (2026-10-27): countdowns are blue above 20 minutes and red at 20 minutes or less, without yellow. Every imminent home lot belongs only to Closing now; Top Deals excludes the entire imminent set, including overflow beyond the closing rail's selection limit. Recompute sections against server-aligned time every second; apply live end-time extensions and silently refresh catalogue metadata every 15 seconds while visible, plus focus/reconnect and debounced live updates. Remove elapsed/terminal cards from active listings without a page reload. Never substitute a stale starting price for a failed live price; preserve reconnect safeguards. Final auction status and settlement remain server-owned.

Home FAQ amendment (2026-10-27): app banner headline fits one line on desktop, with balanced phone wrapping. Follow the app-download banner with a contained dark-ink FAQ panel, promotion-radius corners, centred bold title, separated question rows and yellow Lucide chevrons. Use native accessible details/summary, 44 px minimum targets, clear focus and one open answer at a time. Content must describe existing Auction NG behaviour without invented security or savings claims.

FAQ surface refinement (2026-10-27): replace the dark panel with a white bordered surface, indigo headings and chevrons, light dividers and pale-indigo hover/open backgrounds. The centred title is 40 px/48 desktop and 30 px/36 mobile, weight 800. Preserve the native accessible accordion and existing copy. This supersedes the earlier dark surface and yellow chevrons.

Lot-detail refinement (2026-10-28): two equal desktop gallery/bidding columns, stacking below 1024 px. Remove the reference/pickup subtitle; retain hover/focus breadcrumbs. Price is 36�56 px/800, with condition aligned right and an explicitly labelled retail-estimate comparison. Four large countdown segments use indigo, red at twenty minutes or less, and preserve reconnect safeguards. Guests see Join Now to Bid. Optional fixed offers use a pale-yellow surface, trophy action, auction-deadline countdown and fee disclosure before the configured pickup address. Expanding the offer retains the existing checkout. No invented savings guarantee or transferability claim.

Public item-history refinement (2026-10-28): put the friendly Item ID at the top-left of the bidding card and 44 px circular watch/share actions at top-right. Show estimate percentage in bold red. Buy Now is bold; Join Now to Bid has an ink-colour hover/focus state and restrained lift, disabled for reduced motion. Bid History uses a bordered table with bidder alias, amount, WAT date/time, newest recorded leader highlighted green with a crown, refresh and pagination. Winning Bid is public; Your Bid is disabled for guests and shows only the signed-in buyer�s requests for this item. Keep private rows scoped to the account/view during transitions. Small screens scroll the table inside its panel; never widen the page. Public rows expose only recorded prices and lot-scoped aliases, never private automatic limits or personal details.

Item gallery correction (2026-10-29): owner requests an edge-to-edge cover crop in the square detail frame, removing letterbox space and the View larger overlay. Clicking/tapping the image or pressing Enter opens a wide photo dialog showing the complete image with contain sizing, a top-right close icon and Escape dismissal. Return focus to the image trigger on dismissal. This supersedes the earlier contain-sized detail card; inspection in the popup retains the full photo.

Item information layout (2026-10-29): sticky desktop gallery under the compact header, bounded by the detail grid, and one page scroll; static gallery at tablet/phone widths. Right column after Pickup location: Description (open), public/personal Bid History, Condition (open), Pickup and delivery (expandable). History uses ten rows per cursor page with Previous/Next; Similar items spans the full container below the columns. Only empty DEMO-prefixed lots may show a clearly labelled 23-row read-only history preview, without a leading-row crown or any connection to accepted bids, live prices or wallet holds. Saved history takes precedence; error and personal states never substitute sample history.

Auction-policy section (2026-10-29): open, expandable section after Pickup and delivery. Use concise labelled clauses, all five shared condition badges, real per-item Naira starting price and shared fee constants. Emphasise inspect/test before accepting and removing goods, with a restrained bordered no-returns-after-collection callout. Align Help and draft Terms from shared collection wording; preserve applicable statutory rights and separate financial refunds. Do not claim universal starting prices, no reserves, card-on-file charges, transfers or unapproved collection/restocking deadlines.

Deals browsing refinement (2026-10-29): All Deals, Top Deals, Ending Soon and category listings use a large 48�104 px/800 title (38�60 px on phones) and an oversized section-specific Lucide icon. No auction count or generic description. Below, pill-shaped Current bid, Auction ends and Condition controls open native checkbox fieldsets with 44 px rows, visible selected-option counts, hover/focus feedback, Escape and outside-click dismissal, and menus kept inside the viewport. This is the owner-requested pill-radius exception. No pickup selector or Apply button. Multiple selections use OR within each group and AND between groups; debounce automatic reads, retain shareable URL values, reset pagination on edits and provide Clear filters. Current bid and end windows use authoritative live state, including soft-close extensions. Preserve reconnect/error states, 24-item cursor pages, server-aligned expiry and public pricing. Text-search remains separate.

Deals artwork/options amendment (2026-10-29): the owner's three supplied transparent PNG illustrations are the explicit decorative-image exception for All Deals, Top Deals and Ending Soon headings. Serve reproducibly generated WebP copies (roughly 8�10 KB); preserve original PNGs. All three headings use matching 40�64 px/800 uppercase text, an owner-approved sentence-case exception. Selected checkbox rows use pale green with dark-green text/ticks; Clear filters is red. Price options: Under 30,000 Naira, Under 100,000 Naira and 100,000 Naira and above, preserving their requested overlap. End options: Within 1 hour, Ends today, Ends tomorrow; Nigerian calendar boundaries govern today/tomorrow. All conditions start selected, Clear restores them, and a deliberate empty condition selection stays empty on reload. Existing section eligibility remains unchanged.


Buyer portal amendment (2026-10-29): signed-in account routes share a 264 px sticky white sidebar and a flexible content column inside the marketplace container. Use a yellow Check-in action, indigo available-balance tile, Lucide navigation, restrained hover/active states and a collapsible desktop sidebar with a scrollable short-viewport panel. Below 1024 px use an expandable My account menu. Balance has one prominent spendable amount, a smaller reserved-for-active-bids explanation and expandable total/available/reserved details. Keep Buy Now purchase history separate from auction bid history; paid pickup orders alone appear under Awaiting pickup. Never show invented rewards, referral earnings or delivery availability.


Buyer profile/authentication amendment (2026-10-29): Profile contains Full name, read-only Email address with a visible verified tick, optional Phone number and Full address, then a separate Change password panel. Keep account details in shared white panels and use existing form tokens. Signup collects name/password before email proof; login checks email/password before the code step. Provide Forgot password for recovery and existing buyers setting their first password. Explain that changing passwords signs out all devices. Never expose verification codes, passwords or password hashes in screenshots, logs or public activity. Recovery success directs back to login.


Authentication polish (2026-10-29): replace the auth product-photo collage with a solid indigo editorial panel, a large concise headline, fine divider and three factual icon-led statements; no photos, fake metrics, gradients or repeated feature cards. Use a readable form column on the light canvas, a full-width contained desktop layout and top-aligned single-column forms below 1024 px. Back to auctions uses pale indigo with solid indigo hover/focus. Every buyer password field has a labelled 44 px show/hide eye button. Email codes use six separately focusable, numeric inputs with complete-code paste/autofill, arrows and backwards deletion; each box has a visible focus state.
