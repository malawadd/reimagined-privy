# Wallets and controls

Observation date: 2026-09-12

## Confirmed patterns

- Privy wallets support owners, additional signers, policies, and m-of-n key quorums. Authorization keys sign request bodies; private keys remain with the application.
- Privy policies can constrain chains, transfer amounts, recipients, contracts, methods, and parameters. Policy evaluation is provider-enforced, not a UI permission.
- Privy manual approvals place sensitive wallet, policy, signature, and transaction intents into a Dashboard review queue protected by MFA. This is an Enterprise-gated provider capability.
- Safe, Utila, Fireblocks, Fordefi, BitGo, and Squads reinforce the same product pattern: inventory, policy, proposal, approval, execution, and audit are distinct screens and states.

## Ratib decision

A Privy reviewer quorum owns every operating wallet. A separate server authorization key is only an additional signer under narrow policies. Ratib roles govern application access, while Privy determines whether a request can sign or execute. Wallet owner, signer, policy, and name changes are native intents.

Base Sepolia is the sole executable v1 network. Other networks are not displayed as available until their address, asset, policy, transaction, and reconciliation adapters are audited.

## Sources

- https://docs.privy.io/security/wallet-infrastructure/policy-and-controls
- https://docs.privy.io/controls/policies/overview
- https://docs.privy.io/controls/dashboard/overview
- https://docs.privy.io/recipes/wallets/execution-wallets
- https://docs.privy.io/basics/key-concepts
