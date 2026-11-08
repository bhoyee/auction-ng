# LotVanta email previews

Synthetic HTML previews at 360, 768 and 1280px. The example verification code is a fixture, not a usable account code. Product, invoice and location details are fictional.

- `winner-ready-*.png`: paid auction receipt, embedded logo, exact saved WAT pickup deadline, five working days, item-specific storage rate/cap and no automatic wallet debit.
- `sign-in-*.png`: shared branding, readable one-time code and privacy guidance. Signup, password recovery and security confirmations reuse this template.

Browser previews render the same image inline as local Mailpit. SMTP uses the original HTML's CID reference and a static PNG attachment; no external image server is contacted. Inbox-specific Gmail/Outlook rendering and real SMTP delivery are not asserted by these synthetic captures.
