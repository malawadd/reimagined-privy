# Payables, ledger, and integrations

Observation date: 2026-09-12

## Confirmed patterns

- Request Finance and Copperx couple bills, expenses, receipts, payouts, and approval history. Bitwave, Cryptio, TRES Finance, and Cryptoworth emphasize transaction normalization, reconciliation, journal mapping, and export.
- Financial operations systems retain a source record independently from its payment operation. A failed transfer must not erase the bill, expense, payroll item, or audit evidence.
- Accounting integrations require per-organization OAuth credentials and lifecycle handling. The Ratib security model forbids persisting access tokens in ordinary Convex documents.

## Ratib decision

Bills and expenses store their own status and optional Convex file receipt, then create a deterministic linked operation. Batches and payroll retain item-level outcomes. Succeeded operations and verified invoice deposits post immutable two-line operational journal entries; reconciliation reports missing projections and ambiguous provider runs.

CSV export is live. QuickBooks and Xero are not represented as connected until an approved encrypted token-vault or provider-managed OAuth broker is selected and tested. No fake integration state is shown.

## Sources

- https://help.request.finance/en/collections/9570852-expenses
- https://www.bitwave.io/
- https://cryptio.co/
- https://www.tres.finance/
- https://docs.convex.dev/file-storage
