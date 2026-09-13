# Extension seams

These are intentionally documented, not implemented.

- **Solana:** add a chain adapter behind `PrivyGateway`, a Solana asset/address validator, explicit Solana policy compiler, and chain-specific transaction snapshots. Do not weaken EVM discriminated unions.
- **Wallet recovery:** add a tested end-user recovery ceremony and readiness checks around Privy's recovery capabilities. Existing quorum updates still require the current owner authority.
- **Raw RPC and contracts:** add typed, allowlisted method adapters for operations the transfer API cannot express. Simulate, decode, and display calldata; require method/contract/parameter policy conditions.
- **Cross-chain:** model bridge/settlement as multiple linked steps with independent provider IDs, finality, failure recovery, and risk limits. Never describe a cross-chain path as atomic.
- **Fiat payouts and KYB:** integrate a regulated provider, beneficiary vault, KYB/KYC state, sanctions/risk review, bank-status webhooks, refunds, and jurisdiction rules. Never store banking details in ordinary Convex documents.
- **Custodial wallets:** introduce an explicit custody provider boundary, legal/operational ownership model, export/recovery controls, and separate authorization semantics.
- **Swaps:** add quote expiry, slippage/minimum output, contract allowlists, simulation, token approvals, and price-source evidence.
- **Specialist accounting:** extend the controlled USDC operational book with approved valuation sources, cost basis, tax lots, certified GAAP/IFRS presentation, and additional ERP adapters. Keep immutable source journals and reversals.
- **ERP adapters:** implement the existing `ErpConnector` contract for QuickBooks, Xero, and NetSuite while retaining Ratib settlement authority and connector-specific availability rules.
- **Regulated rail activation:** the Circle sandbox adapter must remain gated until native payout attempts, ambiguity handling, and webhook recovery pass live Base Sepolia verification. Production rails additionally require KYB, sanctions controls, jurisdiction rules, and provider approval.
- **Notifications:** consume audit/outbox events through a provider adapter. Keep email/Slack delivery failures outside the money movement state machine and never include secrets or full sensitive payloads.
