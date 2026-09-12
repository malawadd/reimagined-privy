# Invoices and collections

Observation date: 2026-09-12

## Confirmed patterns

- Request Finance models invoices as line items, payer-facing payment requests, status, and accounting evidence. Stablecoin collection products commonly expose a unique payment destination and reconcile provider events back to the receivable.
- Privy emits signed `wallet.funds_deposited` events. The documented `amount` is a stringified integer in token base units, so USDC receipts require six-decimal conversion before comparison or posting.
- Deposit and transaction webhooks are asynchronous and may be retried. Durable receipt insertion and deduplication must precede downstream state changes.

## Ratib decision

Each issued invoice creates one policy-owned Privy collection wallet. The public payment link is backed by a 256-bit capability token whose hash is stored. A verified Base Sepolia USDC deposit updates the invoice exactly once, posts balanced ledger lines, and creates a deterministic sweep run restricted to the organization treasury.

Issuing an invoice is intentionally a live wallet-creation action and requires an exact UI confirmation. Ratib does not connect or sign with a payer wallet on the public page; it displays the exact collection address and observed payment status.

## Sources

- https://help.request.finance/en/collections/7050575-invoices
- https://help.request.finance/en/articles/10123680-smart-contracts-at-request-finance
- https://docs.copperx.io/integrate-payments/create-invoices
- https://docs.privy.io/api-reference/webhooks/wallet/funds_deposited
- https://docs.privy.io/wallets/gas-and-asset-management/assets/balance-event-webhooks
