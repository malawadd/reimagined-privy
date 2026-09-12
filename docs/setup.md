# Setup

1. Use Node 22, enable Corepack, and run `pnpm install`.
2. Copy `.env.example` to `.env`. Keep `PUBLIC_PRIVY_MODE=mock` for local UI development. The Convex CLI writes deployment coordinates to `.env.local`, which has higher precedence.
3. Create separate development Privy and Convex projects. In Privy, enable email OTP and Google, add the local/production domains, and obtain an access-token verification key.
4. Create three Privy Dashboard reviewers, require MFA, and configure the reference 2-of-3 key quorum. Manual approvals and production webhooks require the appropriate Privy entitlement.
5. Create a separate backend authorization key. Never reuse a reviewer or policy-management key for automation.
6. Run `pnpm keys:generate`. It creates ignored local RSA material, a valid Privy P-256 signer, a mock Svix secret, and `.local/convex.local.env`. Import that file with `pnpm exec convex env set --deployment local --from-file .local/convex.local.env --force`. Never commit `.local`.
7. Use `pnpm exec convex dev --configure new --dev-deployment local --once` for the first anonymous/local setup, then `pnpm convex:dev` for normal development. The local backend remains available only while that process runs and stores state under `.convex`.
8. `ALLOW_INSECURE_MOCK_AUTH=true` permits only the hard-coded local mock access token and must never be configured on staging or production. Replace every mock Privy value and set `PRIVY_MODE=live` before live integration.
9. Configure the Privy webhook destination as `<PUBLIC_CONVEX_SITE_URL>/webhooks/privy`. Subscribe to intent, wallet-action transfer, transaction, deposit/withdrawal, wallet-security, and MFA events.
10. Configure Base Sepolia sponsorship if used, fund the treasury with test ETH and Circle Base Sepolia USDC, then complete the opt-in smoke sequence.

## Live Privy smoke test

`pnpm privy:smoke` is read-only by default and verifies the app credentials by listing wallets and intents. The command reads missing server credentials directly from the active local Convex deployment, so secrets do not need to be duplicated in `.env` or shell history. To exercise live writes, set `PRIVY_LIVE_SMOKE_WRITE=true`; the command also reads the private authorization key from local Convex and the public half from `.local/privy-authorization-public.txt`.

The write smoke test is deliberately non-financial. It creates a resumable 1-of-1 development key quorum, a deny-all policy owned by that quorum, an empty Ethereum wallet with the policy attached, and pending wallet/policy update intents. It verifies provider reads and wallet-creation idempotency, writes resumable non-secret resource IDs to `.local/privy-live-smoke.json`, and never creates, approves, or broadcasts a transfer.

This smoke quorum is not the showcase management quorum. Configure the real 2-of-3 Dashboard reviewer quorum separately and use its ID when provisioning the showcase treasury. Actual transfer smoke tests require a direct user instruction that specifies the Base Sepolia recipient, asset, and amount.

For RSA rotation, generate a new key/kid, publish old and new public JWKs together, switch the signing private key/kid, wait longer than the five-minute JWT lifetime, then remove the old JWK.
