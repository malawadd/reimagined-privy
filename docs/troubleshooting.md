# Troubleshooting

- **Convex remains unauthenticated:** confirm both public Convex URLs, inspect `/auth/exchange`, and verify Privy's access-token verification key, app ID, issuer, JWT audience `convex`, kid, and five-minute timestamps.
- **OAuth returns to login:** add the exact callback origin/path in Privy and verify the browser adapter restores the session after `initialize()`.
- **Intent never appears:** confirm Enterprise approval access, wallet/policy owner quorum, reviewer MFA, and that the backend called `client.intents()` rather than a direct update.
- **Automation receives `policy_violation`:** verify Base Sepolia, Circle test USDC, amount ≤ configured ceiling, exact recipient allowlist, signer attachment, and signer override policy.
- **Duplicate webhook:** this is expected with at-least-once delivery. Confirm one receipt for the Svix ID/idempotency key and inspect processing errors.
- **Ambiguous run:** do not replay manually. Reconcile by provider reference/action ID; only retry when lookup proves no side effect exists.
- **Build gate fails:** local `pnpm build` supports mock UI validation. Deployment must use `pnpm build:production` with `PUBLIC_PRIVY_MODE=live` and complete HTTPS public configuration.
- **Convex type errors after cloning:** run `pnpm convex:dev` to regenerate `src/convex/_generated` for your project.
