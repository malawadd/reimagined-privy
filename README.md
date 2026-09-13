# Ratib Finance OS

Ratib is a SvelteKit, Convex, and Privy operations workspace for crypto-native businesses. It provides organization-scoped wallets, Base Sepolia payments, Privy-native approvals, policy-bound automation, invoice collection, payables, batches, payroll, reconciliation, and immutable audit evidence.

There is no runtime mock mode. Authentication, wallet provisioning, transfers, intents, balances, and webhooks use configured Privy and Convex services. Screens show truthful loading, unavailable, and empty states when those services or business records are absent.

## Quick start

Requirements: Node 22, pnpm, a Convex project, and a Privy development app.

```bash
pnpm install
pnpm keys:generate
pnpm convex:env:local
pnpm convex:dev
pnpm dev:ui
```

Before signing in, set the browser-safe values from `.env.example` and load the real Privy App ID, App Secret, access-token verification key, and webhook signing key into the selected Convex deployment. Register the generated Privy authorization public key in the development Privy app. See [setup](docs/setup.md) and [credentials](docs/credentials.md).

## Product surface

- Self-service organization creation and durable treasury provisioning
- Live Base Sepolia treasury and invoice collection wallets
- Approved counterparties and exact-confirmation ETH/USDC payments
- Native Privy intent routing, reviewer quorum visibility, and reconciliation
- USDC invoices, public payment links, deposit webhooks, and policy-owned sweeps
- Bills, expenses, versioned payout runs, payroll CSV import, compensation snapshots, and retry
- Scheduled automations with deterministic execution keys
- Controlled accounting books, reviewed journals, close periods, reconciliation, and reports
- ERPNext connection and synchronization managed inside Ratib
- Signed `/v1` service-account API, idempotent writes, domain webhooks, and delivery replay

Application roles never confer Privy signing authority. Privy owners, policies, signers, and reviewer quorums remain the final transaction authority.

## Commands

| Command                 | Purpose                          |
| ----------------------- | -------------------------------- |
| `pnpm dev`              | Run Convex and Vite together     |
| `pnpm dev:ui`           | Run Vite only                    |
| `pnpm convex:dev`       | Generate bindings and run Convex |
| `pnpm check`            | Svelte and TypeScript validation |
| `pnpm lint`             | Prettier and ESLint checks       |
| `pnpm test`             | Unit and provider-contract tests |
| `pnpm test:e2e`         | Public browser acceptance tests  |
| `pnpm build:production` | Fail-closed deployment build     |

## Scope

Base Sepolia is the only executable wallet network: chain ID `84532`, CAIP-2 `eip155:84532`, and Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. Mainnet, production fiat rails, cards, KYB/KYC, swaps, bridges, and tax-lot accounting remain disabled. ERPNext is the first organization-managed connector. Its prototype saved-credential option encrypts the secret with a Convex-only AES-256-GCM wrapping key; admins can instead use a transient credential for a single request.
