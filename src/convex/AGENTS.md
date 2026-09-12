# Convex and Privy guidance

Public queries/mutations must call `requireMembership` with the organization ID and capability before reading business data. Fetch a requested record, then `assertOrgScoped` it. Return "not found" semantics for cross-tenant IDs.

All Privy traffic lives in internal Node actions behind `PrivyGateway`. Mutations create durable state/outbox records and schedule actions; actions never become the source of truth. Use transfer actions for payouts. Use transfer, wallet-update, and policy-update intents for owner-governed work.

`PRIVY_MODE=mock` is allowed only in local development/tests. A deployment must supply app ID/secret, authorization private key, webhook signing key, access-token verification key, and JWT signing material through Convex environment variables.

Webhook processing order: preserve raw body → verify Svix → insert/dedupe receipt → acknowledge 2xx → process internally → apply monotonic state → append audit. Never acknowledge an unpersisted event.

Scheduled mutations are the durable outbox producer. Scheduled actions can fail or complete ambiguously, so lookup by `providerReferenceId` before retrying—especially after Privy's 24-hour idempotency window.
