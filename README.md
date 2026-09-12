# Privy B2B Operations Starter

An opinionated SvelteKit + Convex reference application for controlled B2B crypto operations. It demonstrates a Base Sepolia treasury, Privy-native approvals, policy-bounded automation, organization-scoped authorization, signed webhook ingestion, reconciliation, and end-to-end audit evidence.

## Quick start

Requirements: Node 22 and pnpm.

```bash
cp .env.example .env
pnpm install
pnpm keys:generate
pnpm convex:env:local
pnpm dev
```

The checked-in workspace is configured for a local Convex deployment at `127.0.0.1:3210` and defaults to `PUBLIC_PRIVY_MODE=mock`. Sign in with any email and OTP `123456`, or choose Google. Mock mode exists for local development and tests only. `pnpm dev` keeps both Convex and Vite running; use `pnpm dev:ui` only when Convex is already running elsewhere.

For the backend, create a Convex project, set `PUBLIC_CONVEX_URL` and `PUBLIC_CONVEX_SITE_URL`, then run `pnpm convex:dev`. Generate the custom-JWT RSA material with `pnpm keys:generate` and move the private PEM into Convex environment variables immediately.

## What is included

- Svelte 5/SvelteKit 2 operations console with email/Google Privy auth adapter.
- `convex-svelte` auth token exchange into five-minute RS256 Convex JWTs.
- Organization-scoped schema and public capability contracts.
- Application RBAC separated from Privy reviewer/quorum authority.
- Typed live/mock `PrivyGateway`; direct transfers use the transfer action API and administrative changes use intents.
- Recurring vendor-payment and deposit-triggered sweep flows with deterministic, replay-safe outbox runs.
- Raw-body Svix webhook verification, durable deduplication, monotonic state handling, reconciliation cron, and redacted audit records.
- Unit, contract-fixture, and Playwright coverage plus CI and deployment gates.
- Reviewed local agent skills in `.agents/skills` and nested `AGENTS.md` instructions.

## Commands

| Command                 | Purpose                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| `pnpm dev`              | Run the selected Convex deployment and Vite together                |
| `pnpm dev:ui`           | Run only Vite                                                       |
| `pnpm convex:dev`       | Generate Convex bindings and run the backend                        |
| `pnpm check`            | Svelte and TypeScript validation                                    |
| `pnpm lint`             | Prettier and ESLint checks                                          |
| `pnpm test`             | Unit and provider-contract tests                                    |
| `pnpm test:e2e`         | Browser acceptance tests                                            |
| `pnpm build`            | Local production bundle                                             |
| `pnpm build:production` | Deployment build; fails unless live public configuration is present |

Read [architecture](docs/architecture.md), [security](docs/security.md), [setup](docs/setup.md), [deployment](docs/deployment.md), [demo script](docs/demo-script.md), [troubleshooting](docs/troubleshooting.md), and [extensions](docs/extensions.md).

Privy Dashboard locations and safe secret-loading commands are listed in [credentials](docs/credentials.md).

## Scope

V1 executes only Base Sepolia ETH and USDC crypto payouts. It deliberately excludes mainnet, fiat rails, banking data, KYB/KYC, compliance screening, custody migrations, swaps, bridges, and LLM-generated transactions. Those are documented extension seams, not partially implemented features.
