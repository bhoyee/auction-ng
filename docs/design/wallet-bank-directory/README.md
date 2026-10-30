# Actual Paystack bank-directory regression

The reported list failure was reproduced in the running Docker adapter: Paystack
returned HTTP 200, but page two contained MINT-FINEX MFB with code `09`. Our shared
three-character minimum rejected the whole page. Correct the directory-code and
withdrawal-input minima to two characters, preserving leading zeros, strict input
validation, verified account ownership and all payment rules.

Validation on 2026-10-30: the corrected deployed adapter read all nine actual
Paystack directory pages with the configured test key, returning 292 active banks.
Only public bank metadata was captured in ignored
`.tools/paystack-bank-pages.json`; no credentials or customer data were captured.
`node scripts/check-withdrawal-ui.mjs --provider-banks` feeds those actual adapter
responses into the browser at 360, 768 and 1280 px. Authentication and wallet data
remain synthetic. This verifies full-directory client parsing and selecting the
two-digit-code bank; it does not verify customer BVNs or send payments.

Nineteen targeted bank-schema/provider tests pass, including regression tests that
failed before the correction. Relevant lint/type checks and API/worker/web builds
pass. No broader money/bid suite was run for this identifier-format correction.

- [Phone](search-360.png)
- [Tablet](search-768.png)
- [Desktop](search-1280.png)
