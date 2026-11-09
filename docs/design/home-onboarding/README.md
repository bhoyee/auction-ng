# Homepage onboarding cards

The signed-out guide now follows the hero and precedes Closing now / Top deals. Three steps explain Sign up & top up, Bid & win, and Pick up & repeat, with real action links and factual copy. The earlier lower-page strip is replaced, and returning signed-in buyers keep the existing guide-free experience.

The card visuals use shared brand tokens and Lucide icons. No new images, dependencies, fake statistics, savings guarantees or changes to funding/bidding/pickup logic.

Automated tests remain deferred at the owner's request. Web-only production build and design screenshots are used to preview this presentation change locally.

Owner refinement: removed visible step numbers and action links. Headings now read Sign Up & Top, Bid & Win, Pick Up & Repeat, use weight 800, and cards have 32 px corners via the shared promotion token. Descriptions and panels remain.

Hover refinement: fine-pointer hover lifts the card 4 px, adds the shared hover shadow/indigo border and gently emphasises its icon over 150 ms. Reduced motion disables the lift, scale and transitions. Cards remain informational; no new links or pointer cursor.

Inner artwork update: the three icon/text panels now use the supplied guide-1/2/3 PNG images. All three currently contain the same wallet illustration; the owner was informed, and the exact files are used for preview. Titles, copy, outer cards and hover effects remain. Automated tests remain deferred.

Spacing correction: paragraphs no longer reserve extra height, artwork is no longer pushed to the card bottom, and natural image proportions replace the fixed frame. Compact WebP display copies trim empty transparent borders while preserving the owner PNGs. The updated first image supplied by the owner is included. Automated tests remain deferred.

Image-only update: all visible guide headings, paragraphs, section title and trust lines are removed. The current three supplied PNGs contain their own headings/copy. Full text alternatives remain for screen readers. Responsive AVIF/WebP copies are generated automatically during web build, use hashed filenames with long-lived caching, lazy loading and reserved dimensions. AVIF files range from roughly 10 KB at 480 px to 37 KB at 1200 px, versus roughly 1.2 MB per source PNG. No slow-network timing guarantee is claimed; browser selection and file/cache delivery are reviewed separately from deferred automated tests.

Focused delivery review: Chromium at 360 px selected 480 px AVIF files (31,064 bytes combined) at 1x density and 800 px AVIF files (57,432 bytes combined) at 2x. At 1440 px / 1x it selected the 480 px variants. Optimized URLs returned public, max-age=31536000, immutable. See image-delivery.json. This confirms responsive selection and cache headers, not real-world weak-network timing.
