# Architecture

## Request path

The public SvelteKit route is SSR-capable. The authenticated console initializes the framework-neutral Privy client in the browser, including its hidden secure-wallet iframe. `convex-svelte` asks the adapter for a Privy access token and posts it to the Convex HTTP action `/auth/exchange`. The Node action verifies the Privy token, then creates a five-minute RS256 token with `sub=Privy DID`, `sid`, configured issuer, `aud=convex`, `iat`, `exp`, and `kid`.

Convex resolves that identity on every public function. The function then resolves `users → memberships → organization`, checks its capability, and scopes every lookup by organization. The client is never trusted to declare identity, role, or authorization.

## Wallet control topology

Each organization has one Base Sepolia operating treasury. A Privy key quorum representing three Dashboard reviewers owns the wallet and its policies; threshold two and MFA are configured in Privy. A distinct backend authorization key is attached as a signer.

The owner policy permits reviewer-authorized ETH and USDC transfers with high configured limits. Signer overrides permit only Base Sepolia USDC transfers up to 100 USDC to approved recipients, plus a separate sweep rule whose only destination is the treasury. Everything not explicitly matched is denied.

## Operation routing

- Allowlisted USDC at or below 100: create the operation, then call Privy's transfer action with the automation key.
- Higher or unlisted ETH/USDC: create a native `TRANSFER` intent for the owner quorum.
- Outside the owner policy: return `policy_change_required`; an approved policy-update intent must land first.
- Wallet owner, signer, name, and policy administration: always native wallet/policy intents.

Provider IDs are mirrored in intent and wallet-action snapshot tables. The local state explains and displays provider state; it does not override it.

## Durable execution

Recurring schedules and deposit events first produce an `automationRuns` document keyed by `automationId:scheduledTimestamp` or `automationId:sourceWebhookId`. A mutation atomically claims it before scheduling the Node action. That run key is also the provider idempotency/reference value.

Ambiguous external results are not blindly retried. Reconciliation looks up provider state by intent/action/reference. This matters after Privy's 24-hour idempotency guarantee and because Convex scheduled actions are at-most-once. A five-minute cron reconciles pending intents, wallet actions, and ambiguous runs.

## Webhooks

`POST /webhooks/privy` reads the untouched body, validates all Svix headers with the Convex-only signing key, inserts a durable receipt, and then acknowledges. Receipts deduplicate by Svix message ID and payload idempotency key. Processors map provider events into monotonic operation transitions and append redacted audit evidence.
