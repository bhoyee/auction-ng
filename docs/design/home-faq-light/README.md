# Lighter FAQ surface

2026-10-27: replace the heavy dark FAQ panel with a white bordered surface, indigo typography and chevrons, soft dividers and pale-indigo hover/open backgrounds. Increase the title from 32 to 40 px on desktop and from 25 to 30 px on phones. Existing FAQ content and native accordion interaction remain.

Previews: [desktop](faq-1280.png), [phone](faq-360.png), [expanded phone answer](faq-open-360.png), [tablet](faq-768.png). [Focused review](review.json) confirms keyboard toggling, one open answer and no horizontal page overflow at 360/768/1280/1440 px.

CSS formatting and the production web build passed. The existing focused browser interaction check passed against the revised surface; no full test suite was run. Only the local web container was updated. T13 acceptance remains open.
