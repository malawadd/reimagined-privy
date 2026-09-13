# Setup

1. Use Node 22, enable Corepack, and run `pnpm install`.
2. Copy `.env.example` to `.env` and set the browser-safe Privy and Convex identifiers. The Convex CLI writes deployment coordinates to `.env.local`, which has higher precedence.
3. Create separate development Privy and Convex projects. In Privy, enable email OTP and Google, add the local/production domains, and obtain an access-token verification key.
4. Enable Privy user-owned wallets, authorization signatures, intents, and the webhook events used by Ratib. Organization owners and approvers operate these controls inside Ratib.
5. Create a separate backend authorization key. Never reuse a reviewer or policy-management key for automation.
6. Run `pnpm keys:generate`. It creates ignored RSA material for the Convex auth bridge, a Privy P-256 authorization signer, and `.local/generated-auth.env`. Import it with `pnpm convex:env:local`, then set the real Privy App ID, App Secret, access-token verification key, and webhook signing key separately. Never commit `.local`.
7. Use `pnpm exec convex dev --configure new --dev-deployment local --once` for the first anonymous/local setup, then `pnpm convex:dev` for normal development. The local backend remains available only while that process runs and stores state under `.convex`.
8. Ratib has no runtime mock authentication or provider gateway. A missing or invalid Privy credential fails closed in every environment.
9. Set `PRIVY_AUTHORIZATION_KEY_ID` to the registered public authorization-key ID used for policy-bounded automation. Configure the Privy webhook destination as `<PUBLIC_CONVEX_SITE_URL>/webhooks/privy` and subscribe to intent, wallet-action transfer, transaction, deposit/withdrawal, wallet-security, and MFA events.
10. Configure Base Sepolia sponsorship if used, fund the treasury with test ETH and Circle Base Sepolia USDC, then complete the opt-in smoke sequence.

## Self-service organization setup

After login, `Create organization` starts a recoverable provisioning run. Ratib creates the owner quorum, Base Sepolia owner policy, first treasury wallet, owner assignment, reviewer mirror, and the organization-scoped reference to the configured platform automation signer. Invoice collection creates a destination-specific sweep policy before attaching that signer. Customers do not need the Privy Dashboard for normal product workflows.

ERPNext admins connect from `/app/integrations`. A dedicated least-privilege ERPNext integration user is recommended. Transient credentials are used only for the active request. Saved prototype credentials require `ERP_CREDENTIAL_WRAPPING_KEY`, are encrypted before insertion, and enable background synchronization.

## Live Privy smoke test

`pnpm privy:smoke` is read-only by default and verifies the app credentials by listing wallets and intents. The command reads missing server credentials directly from the active local Convex deployment, so secrets do not need to be duplicated in `.env` or shell history. To exercise live writes, set `PRIVY_LIVE_SMOKE_WRITE=true`; the command also reads the private authorization key from local Convex and the public half from `.local/privy-authorization-public.txt`.

The write smoke test is deliberately non-financial. It creates a resumable 1-of-1 development key quorum, a deny-all policy owned by that quorum, an empty Ethereum wallet with the policy attached, and pending wallet/policy update intents. It verifies provider reads and wallet-creation idempotency, writes resumable non-secret resource IDs to `.local/privy-live-smoke.json`, and never creates, approves, or broadcasts a transfer.

This smoke quorum is isolated from customer organizations. Customer owners configure wallet members and thresholds from Ratib, and those changes are submitted as Privy intents for authorization inside Ratib. Actual transfer smoke tests require a direct user instruction that specifies the Base Sepolia recipient, asset, and amount.

For RSA rotation, generate a new key/kid, publish old and new public JWKs together, switch the signing private key/kid, wait longer than the five-minute JWT lifetime, then remove the old JWK.
