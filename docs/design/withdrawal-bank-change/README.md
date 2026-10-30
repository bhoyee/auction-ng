# Change withdrawal account

Use Withdraw, then Change account beside the bold name and last four digits.
The existing account remains selected until password/email confirmation and the
provider's BVN/bank verification succeed. Pending withdrawals block account changes.
Indigo actions, solid red failure banners, an indigo verification banner and green
completion feedback use existing shared components and tokens.

`node scripts/check-withdrawal-ui.mjs --bank-change` checks the action, bank search,
password/consent form, blocked request feedback, six code boxes, wrong-code retry,
pending verification and replacement selection at 360/768/1280 px. Fixtures simulate
authentication, bank verification and callbacks; no real BVN request or payout is
sent. Eighteen withdrawal/bank-change integration/concurrency tests and eight email
tests also pass. API/web type checks, targeted lint and affected builds pass.

The additive migration was applied locally and the complete database dictionary
regenerated. Actual provider KYC acceptance and production activation are separate
open withdrawal launch gates.

**MONEY/BID CHANGE — needs human review**

- Phone: [form](form-360.png), [blocked](blocked-360.png), [code](code-360.png),
  [pending](pending-360.png), [complete](complete-360.png)
- Tablet: [form](form-768.png), [blocked](blocked-768.png), [code](code-768.png),
  [pending](pending-768.png), [complete](complete-768.png)
- Desktop: [form](form-1280.png), [blocked](blocked-1280.png), [code](code-1280.png),
  [pending](pending-1280.png), [complete](complete-1280.png)
