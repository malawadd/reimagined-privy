# Engineering guidance

This repository is a security-sensitive B2B operations starter. Read the closest nested `AGENTS.md` before editing a subsystem.

## Invariants

1. Every business record and every public Convex function is organization-scoped. Resolve the Privy DID from `ctx.auth`, resolve the local user, require an active membership, then enforce the capability. Never accept a user ID or role from the client.
2. Client guards are presentation only. Convex authorization is the boundary.
3. Application roles and Privy authority are distinct. An `approver` can view pending work but cannot sign unless that human is also a Privy owner-quorum member. Customer approval and quorum workflows stay inside Ratib.
4. Privy is the final policy authority. A local preview explains routing; it never grants permission.
5. Wallet owner, signer, display-name, and policy changes use native intents. Do not add direct privileged update paths.
6. Automation keys, Privy/app secrets, webhook secrets, JWT private keys, access tokens, and authorization signatures are Convex environment variables only. Never persist or log them. The sole prototype exception is organization-approved ERPNext credentials encrypted inside a Node action with AES-256-GCM under a Convex-only wrapping key; never return ciphertext publicly and erase it on disconnect.
7. Store monetary values as validated decimal strings. Convert with `bigint`; never use floating point.
8. Base Sepolia is the only executable v1 network: chain ID `84532`, CAIP-2 `eip155:84532`, transfer chain `base_sepolia`, Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.
9. Provider side effects are at-most-once. Insert a deterministic run first, atomically claim it, use its run key for idempotency/reference, and reconcile ambiguous results by provider reference before retrying.
10. Webhooks are at-least-once. Verify raw bytes and Svix headers before durable insertion, deduplicate, and prevent state regression.
11. Audit events are append-only. Redact metadata before insertion; never edit historical evidence.
12. Production uses live mode and separate production projects/keys/funding. The deployment build must fail closed for mock or incomplete public configuration.

## State machines

Operations: `draft → queued → pendingApproval|executing → pendingConfirmation → succeeded`, with terminal `rejected|expired|failed|cancelled`. Only transitions in `src/lib/domain.ts` are valid.

Automation runs: `pending → claimed → submitted → succeeded`; uncertain provider responses become `ambiguous` and are reconciled before another side effect.

## Commands and generated files

- Node 22 and pnpm are the supported baseline.
- Run `pnpm check`, `pnpm lint`, `pnpm test`, and `pnpm build` before handing off.
- `src/convex/_generated/*` is owned by Convex codegen. The checked-in fallback permits an unconfigured clone to type-check; do not add business logic there.
- Do not regenerate `pnpm-lock.yaml` with npm/yarn.
- Privy package versions are exact. Review SDK changelogs and sanitized contract fixtures before upgrades.

## Testing expectations

Pure rules require unit tests. Authorization/data changes require `convex-test`. Provider changes require sanitized contract fixtures. User journeys require Playwright. Live Base Sepolia smoke tests are opt-in and must use a separately funded development project.

## Forbidden shortcuts

No secrets in `PUBLIC_*`, Svelte modules, fixtures, analytics, or errors. No unscoped table scans in public functions. No client-supplied roles. No raw RPC for ordinary payouts. No direct owner/policy mutation. No retry of an ambiguous external write without lookup. No mainnet fallback. No bypass of `PrivyGateway`.
