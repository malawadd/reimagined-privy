# Extension seams

These are intentionally documented, not implemented.

- **Solana:** add a chain adapter behind `PrivyGateway`, a Solana asset/address validator, explicit Solana policy compiler, and chain-specific transaction snapshots. Do not weaken EVM discriminated unions.
- **Customer approvals:** introduce user-owned key quorums per customer organization, enrollment/recovery UX, and strong tenant isolation. Do not map SaaS roles automatically to signing keys.
- **Raw RPC and contracts:** add typed, allowlisted method adapters for operations the transfer API cannot express. Simulate, decode, and display calldata; require method/contract/parameter policy conditions.
- **Cross-chain:** model bridge/settlement as multiple linked steps with independent provider IDs, finality, failure recovery, and risk limits. Never describe a cross-chain path as atomic.
- **Fiat payouts and KYB:** integrate a regulated provider, beneficiary vault, KYB/KYC state, sanctions/risk review, bank-status webhooks, refunds, and jurisdiction rules. Never store banking details in ordinary Convex documents.
- **Custodial wallets:** introduce an explicit custody provider boundary, legal/operational ownership model, export/recovery controls, and separate authorization semantics.
- **Swaps:** add quote expiry, slippage/minimum output, contract allowlists, simulation, token approvals, and price-source evidence.
- **Accounting exports:** emit immutable journal mappings from succeeded operations and corrections, not mutable CSV snapshots; attach provider/transaction correlation.
- **Notifications:** consume audit/outbox events through a provider adapter. Keep email/Slack delivery failures outside the money movement state machine and never include secrets or full sensitive payloads.
