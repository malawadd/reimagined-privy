# Architecture

## Request path

The public SvelteKit route is SSR-capable. The authenticated console initializes the framework-neutral Privy client in the browser, including its hidden secure-wallet iframe. `convex-svelte` asks the adapter for a Privy access token and posts it to the Convex HTTP action `/auth/exchange`. The Node action verifies the Privy token, then creates a five-minute RS256 token with `sub=Privy DID`, `sid`, configured issuer, `aud=convex`, `iat`, `exp`, and `kid`.

Convex resolves that identity on every public function. The function then resolves `users → memberships → organization`, checks its capability, and scopes every lookup by organization. The client is never trusted to declare identity, role, or authorization.

## Wallet control topology

Each organization provisions a Base Sepolia treasury in Ratib. The creating Privy user starts as a 1-of-1 owner quorum and can add approvers or change the threshold through authorized Privy intents. Ratib mirrors quorum membership for presentation and capability checks; Privy remains authoritative. A platform backend authorization key may be attached only under a narrow signer-override policy.

The owner policy permits reviewer-authorized ETH and USDC transfers with high configured limits. Signer overrides permit only Base Sepolia USDC transfers up to 100 USDC to approved recipients, plus a separate sweep rule whose only destination is the treasury. Everything not explicitly matched is denied.

## Operation routing

- USDC executes automatically only when the wallet's currently attached Privy signer policy explicitly matches its chain, asset, amount, and destination.
- Higher or unlisted ETH/USDC: create a native `TRANSFER` intent for the owner quorum.
- Outside the owner policy: return `policy_change_required`; an approved policy-update intent must land first.
- Wallet owner, signer, name, and policy administration: always native wallet/policy intents.

Provider IDs are mirrored in intent and wallet-action snapshot tables. The local state explains and displays provider state; it does not override it.

## Durable execution

Recurring schedules and deposit events first produce an `automationRuns` document keyed by `automationId:scheduledTimestamp` or `automationId:sourceWebhookId`. A mutation atomically claims it before scheduling the Node action. That run key is also the provider idempotency/reference value.

Ambiguous external results are not blindly retried. Provider attempts are inserted first, atomically claimed, and reconciled by intent/action/reference. A five-minute cron reconciles pending intents, wallet actions, and ambiguous runs.

## Webhooks

`POST /webhooks/privy` reads the untouched body within a fixed size limit, validates all Svix headers with the Convex-only signing key, inserts a durable receipt, and then acknowledges. Receipts deduplicate by Svix message ID and payload idempotency key. A guarded processor maps provider events into monotonic operation transitions and records sanitized processing failures on the receipt.

## Finance and integration boundaries

The operational ledger remains immutable source evidence while the accounting book shadow-posts source-linked journals. Posted journals are corrected by reversal, locked periods reject new manual postings, and close is blocked by unresolved material exceptions. ERPNext remains master for ERP entities and submitted documents; Ratib remains master for wallets, approvals, execution, and settlement evidence.

The customer API is a versioned Convex HTTP facade. API service accounts and public-key credentials are separate from Privy automation signers. Machine callers may create approval-bound operations but cannot authorize intents, change wallet owners, or broaden policies.
