# Wallet and ledger contracts

T05 implements internal integer-kobo accounting. No payment provider is called. Opening a wallet creates empty accounts; it does not create a bank account, verify a phone, take BVN consent or credit funds. Paystack verification and reconciliation belong to T06; bidding and closing integrations belong to T09/T12.

## Operations

Only `apps/api/src/ledger` writes journals, postings and reservations. `LedgerService` methods accept a wallet UUID, globally unique `idempotencyKey` and globally unique `reference`. Identifiers contain 8–128 ASCII letters, digits, colons, dots, underscores or hyphens. Amounts are positive bigint kobo, at most `Number.MAX_SAFE_INTEGER`; available plus held funds cannot exceed that limit. HTTP responses use safe integer kobo numbers.

| Method        | Additional input                    | Debit             | Credit                         | Behaviour                                                                                 |
| ------------- | ----------------------------------- | ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------- |
| `topup`       | `amountKobo`                        | Payments clearing | Available                      | Internal credit; caller must verify the provider before calling                           |
| `hold`        | `holdId`, `amountKobo`              | Available         | Held                           | Desired total reservation; raising moves only the additional amount                       |
| `releaseHold` | `holdId`                            | Held              | Available                      | Releases the whole active reservation                                                     |
| `captureHold` | `holdId`, `amountKobo`              | Held              | Sales settlement and available | Charges the actual invoice total and immediately returns any unused reservation           |
| `debit`       | `amountKobo`                        | Available         | Sales settlement               | Rejects spending reserved funds                                                           |
| `refund`      | `sourceTransactionId`, `amountKobo` | Sales settlement  | Available                      | Partial/full refund capped at the unrefunded original debit or capture on the same wallet |
| `payout`      | `amountKobo`                        | Available         | Payout clearing                | Internal accounting only; does not execute a bank transfer                                |

Wallet accounts are liabilities: credits increase funds and debits reduce them. System clearing accounts may have opposite signed balances. Every journal has equal debit and credit totals. Zero postings are omitted. A hold UUID belongs to one wallet; active holds can only increase, then settle once as released or captured. Capture cannot exceed the reserved total. A raise receipt records the incremental movement, while its request fingerprint contains the desired total.

Callers calculate fees using `packages/shared`; this module never duplicates fee or bid rules. External withdrawal approval, provider execution, failures/reversals and reconciliation need their own integration before payout can be exposed to buyers. A payout journal alone is not confirmation of a real bank transfer.

## Transactions, retries and failures

Each operation takes transaction-scoped advisory locks in this order: idempotency key, reference, then `SELECT … FOR UPDATE` on the wallet. Independent API instances share these PostgreSQL locks. A stored SHA-256 fingerprint binds each key to the complete validated operation. Exact retries return the original immutable receipt even after its hold has settled; changed payloads conflict. A reference cannot be used again under a new key. Failed operations roll back holds, journals and postings together and do not consume the retry key.

Balances are derived from postings in one aggregate statement and reconciled with active reservations. There is no cached balance column. Transactions check funds while holding the wallet row lock. Deferred database triggers also enforce balanced journals, immutable postings, nonnegative wallet balances, safe total funds, reservation reconciliation and metadata/posting agreement. Composite foreign keys bind holds and refund sources to the same wallet. Legacy T02 system-only fixtures may retain null wallet metadata.

Domain errors map centrally to safe HTTP errors: missing wallet 404, invalid input 400, retry/hold conflict 409, insufficient funds or invalid refund 422, invariant failures 500. Responses never reveal database errors or payment credentials.

## Buyer API and clients

All routes require a buyer access token and its installation-bound `X-Device-Id`; responses use `Cache-Control: no-store`. Ownership comes from the authenticated user, never a wallet ID submitted by a client.

- `POST /wallet` with `{}` opens or returns that buyer's wallet, with zero initial funds.
- `GET /wallet` returns `id`, `userId`, `currency`, `availableKobo`, `heldKobo` and `totalKobo`.
- `GET /wallet/history?limit=20&cursor=…` returns `items` and nullable `nextCursor`. Limit is 1–50. Ordering is descending creation time then UUID; cursors include both values. Unknown query fields are rejected.

History uses two fixed queries (wallet lookup plus indexed journal page), with no per-row queries. Items include operation, amount, available/held deltas, hold/refund source IDs and UTC creation time. Idempotency keys, provider references and fingerprints are excluded. Balance aggregation grows with wallet posting count; no bid-path latency claim is made for it. The later Redis bid engine must integrate reservations without database calls on its acceptance path.

`packages/shared/src/wallet-schemas.ts` is the strict contract source; `createWalletClient` in `packages/api-client` validates requests/responses for web and mobile. Local Swagger is at `/docs`. There are no public top-up, debit, hold, refund or payout mutation routes in T05.

## Validation

`pnpm test` creates separate fresh schema, auth and ledger databases; application data is never funded or reset. Tests cover all seven operations and exact replays, changed keys/references, safe-integer rollback, hold transitions, ownership, refund caps, cursor boundaries and protected typed API responses. Fifty concurrent holds across two service instances can reserve only the available funds. Fifty identical retries produce one journal. Capture/release and concurrent refund races settle within their original limits. Ledger-owned invalid-write fixtures prove PostgreSQL rejects overdrafts, orphan holds and metadata mismatches at commit. Every resulting journal balances and wallet funds reconcile to postings and active holds.

The generated [database dictionary](database-schema.md) lists all 24 tables, every column/type, relation, index and unique/check constraint. This money change requires human review before merge.
