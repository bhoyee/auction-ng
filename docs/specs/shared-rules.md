# Shared business rules (T03)

All functions are exported by `@auction-ng/shared`. These are pure calculations and strict DTO validators; they do not accept real bids, move funds or implement a wallet service.

## Money and fees

Inputs and outputs are non-negative safe integer kobo. Ledger conversion is explicit through `toLedgerKobo` / `fromLedgerKobo`; unsafe values and overflow throw `InvalidMoneyError`. `formatNaira` formats integers directly, including values near the safe integer limit, without converting through floating point naira.

`calculateInvoiceLine(hammerKobo, rules)` returns hammer, premium, lot fee, VAT and total, each in kobo. `estimatedTotal(maxKobo, rules)` returns the same total for a maximum bid. Rates are integer basis points (100 basis points = 1%). Defaults are premium 1500 basis points, lot fee 30000 kobo, and provisional VAT 750 basis points. Callers can provide their own complete rules object. Rates must be between 0 and 10000 basis points.

Premium is rounded half up to a kobo once per lot. VAT is calculated on that rounded premium plus the lot fee and rounded half up once per lot. Integer bigint intermediates prevent multiplication overflow and binary rounding errors. The final total must fit a safe integer. Never round an aggregate invoice instead of its individual lot lines.

Example: a ₦500 hammer gives ₦75 premium, ₦300 lot fee, ₦28.13 VAT and a ₦903.13 total. VAT remains subject to business/accountant confirmation before launch.

## Auction rules

`bidIncrement` uses the six bands in AGENTS.md, in kobo. Custom tiers start at zero, have strictly increasing lower bounds and positive increments. Defaults are frozen. `minNextBid(startPriceKobo, currentPriceKobo)` uses the start price when current price is null; otherwise it adds the increment at the current displayed price.

`resolveBid(state, newBid, serverTime, tiers?, softCloseMs?)` returns a new state without mutating its inputs. Null price and null leader mean no bids. The first bidder pays the start price. A higher challenger maximum wins at the lesser of its maximum and the old maximum plus the increment at the pre-bid displayed price. A lower or equal challenger maximum leaves the existing leader in place; the displayed price is capped at that leader's maximum. Equal maxima therefore preserve the earlier accepted leader. The caller must serialize bids; client timestamps cannot determine priority.

A leader can strictly raise their own maximum without changing the displayed price. A challenger must meet `minNextBid`. Invalid amounts, inconsistent states and non-increasing own maxima are rejected. Private maxima are internal state and are excluded from public lot DTOs.

The caller supplies trusted server time as UTC epoch milliseconds. A bid at or after the end is rejected. An accepted bid with at most 120000 ms remaining extends the end to server time plus 120000 ms, with no cap on repeated extensions. The window is configurable; rejected bids never update the original state.

## DTOs and integration boundaries

`lotSchema`, `bidSchema`, `userSchema`, and `walletSchema` reject unknown fields, coercion and unsafe monetary values. IDs and bid idempotency keys are UUIDs. Timestamps require UTC ISO strings. Lot time and price invariants are validated. Statuses and roles reuse the shared persisted values. Wallet DTOs carry non-negative available/held balances in NGN; no encrypted personal fields or provider payloads are exposed.

These validators do not provide authorization, wallet holds, persistence, idempotency storage or Redis atomicity. Those remain subsequent tasks. T07 must port these proxy cases to the single Redis Lua script and test concurrency there. Parallel invocations of this pure function share no writable state; this task cannot prove the atomicity of the future live bid engine.

## Verification

`pnpm test` runs the full suite with Vitest V8 coverage enabled and a per-file 100% line threshold for money, auction rules, proxy bidding, fees and DTO schemas. The coverage summary is written to the ignored `coverage` directory. No production dependency was added; the owner approved the matching development-only `@vitest/coverage-v8@3.2.4`.

**MONEY/BID CHANGE — needs human review** before merge.
