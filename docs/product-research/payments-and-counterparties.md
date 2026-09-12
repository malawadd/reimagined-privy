# Payments and counterparties

Observation date: 2026-09-12

## Confirmed patterns

- Request Finance, Copperx, Mural Pay, Loop Crypto, and institutional treasury products organize outbound movement around beneficiary records, amount/asset entry, review, approval, and lifecycle tracking.
- Privy supports idempotent wallet actions, transaction lifecycle webhooks, balance reads, policies, and manual approval intents. Provider status remains authoritative after submission.
- Batch payout products preserve per-recipient state because a batch can partially succeed or require mixed approval paths.

## Ratib decision

Counterparties are organization-scoped approved addresses. A payment uses an explicit client request key, exact decimal-string validation, a final human confirmation, and a deterministic provider reference. Policy-eligible USDC can use the policy-bound signer; other supported movements create a Privy intent. Batches materialize an independent operation per item.

No fiat payout, corporate card, compliance-screening, bridge, or mainnet option is presented. Those require real provider and regulatory integrations.

## Sources

- https://docs.privy.io/transaction-management/overview
- https://docs.privy.io/api-reference/webhooks/overview
- https://docs.privy.io/controls/dashboard/overview
- https://request.finance/
- https://www.copperx.io/
- https://www.muralpay.com/
