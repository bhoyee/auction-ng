# Invoice detail and print layout

Owner-requested invoice document with brand, invoice number/date, server-confirmed payment status, current buyer account details, item table, recorded charges and bold Naira total. Auction and fixed-price labels remain distinct. Back to awaiting pickup uses an explicit local link; Print / Save as PDF opens the native print dialog. Choose Save as PDF as the printer/destination. No PDF dependency.

A4 print styling removes header, footer, sidebar, page heading, toolbar, cookie notice and pickup action. No private pickup QR token appears in the invoice document. The separate protected pickup-pass route remains available. No money calculation, payment or ownership rules changed. Company registration/tax details and historical billing snapshots were not invented.

## Validation

Changed-file lint/formatting, web/UI types and buyer production build pass. Focused mocked-browser checks at 360/768/1280px cover invoice data, auction/fixed-price labels and totals, back/pass links, print action, print-hidden site furniture, no horizontal overflow and error/retry. A sample A4 PDF was generated from synthetic fixture data; no real buyer details or payments are used. No unrelated full-site suite was run.

| Width | Auction invoice | Buy Now invoice |
| --- | --- | --- |
| 360 | [Invoice](invoice-360.png) | [Buy Now](buy-now-360.png) |
| 768 | [Invoice](invoice-768.png) | [Buy Now](buy-now-768.png) |
| 1280 | [Invoice](invoice-1280.png) | [Buy Now](buy-now-1280.png) |

[Print preview](print-preview.png) - [Synthetic sample PDF](sample-invoice.pdf) - [Results](review.json).
