# Premium lot detail

Open http://localhost:3300/lots/05e52ad9-de99-43d4-b2ad-5167c71994f4 for the current demo.

- [Desktop complete page](page-1280.png), [tablet](page-768.png), [phone](page-360.png): real demo live prices, segmented countdown, estimate comparison, condition, guest action, optional fixed offer and configured pickup address.
- Signed-in captures and checkout captures at 360/768/1280 use an isolated synthetic account/database. The isolated account has no credentials on the running demo socket gateway, so its bidding panel correctly shows reconnecting; checkout uses the isolated API. Real public live pricing is checked separately in the complete-page captures.
- Browser checks cover card fee quote, transfer reservation/cancellation, wallet purchase, one invoice, cancelled bid history and invoice tax. No actual demo funds or live provider payments are used.
- Ten catalogue integration tests and 41 presentation tests passed, alongside affected lint/types and API/web production builds. No full-site test run.
- Reviewed all three widths: no horizontal page overflow; phone stacks the offer action, price/condition remain aligned, gallery retains the whole product and navigation has hover/focus feedback.

The displayed percentage compares the current auction price with a retail estimate; final auction prices can change. Existing money and bid rules are unchanged. Overall T13 loading-budget and owner acceptance remain open.
