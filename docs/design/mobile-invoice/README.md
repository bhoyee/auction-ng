# Mobile invoice presentation

The native invoice and purchase-history cards use shared design tokens, compact payment badges, aligned metadata and money rows, item IDs, a highlighted invoice total and collection details. Print and PDF sharing are explicit actions. Back navigation returns to Purchase History or Awaiting Pickup according to the entry point.

- [Invoice print-template preview](invoice-print-preview.png)
- [Sample A4 PDF](sample-invoice.pdf)
- [Red pre-bid action on narrow web layout](prebid-action-web-360.png)

All artifacts use fictional fixture data. The invoice image is a browser rendering of the HTML print template, not a native screen capture. Physical-device review at 360/768/1280 and Android print/share sheet confirmation remain pending. Native source passed lint, TypeScript, five focused invoice tests and Android bundling. The affected web build and red-token browser check passed. No fees or invoice totals were recalculated.
