# Setup

1. Use Node 22, enable Corepack, and run `pnpm install`.
2. Copy `.env.example` to `.env.local`. Keep `PUBLIC_PRIVY_MODE=mock` for local UI development.
3. Create separate development Privy and Convex projects. In Privy, enable email OTP and Google, add the local/production domains, and obtain an access-token verification key.
4. Create three Privy Dashboard reviewers, require MFA, and configure the reference 2-of-3 key quorum. Manual approvals and production webhooks require the appropriate Privy entitlement.
5. Create a separate backend authorization key. Never reuse a reviewer or policy-management key for automation.
6. Run `pnpm keys:generate`. Put `.local/convex-auth-private.pem` into Convex as `AUTH_PRIVATE_KEY_PEM`, set `AUTH_JWT_KID`, encode the JWKS JSON as a `data:application/json,...` value in `CONVEX_AUTH_JWKS`, then securely delete the local private file.
7. Set all non-public values listed in `.env.example` with `pnpm convex env set`. Set `PRIVY_MODE=mock` for local backend tests or `live` for integration/deployment.
8. Run `pnpm convex:dev`; this replaces the checked-in fallback bindings with generated Convex bindings.
9. Configure the Privy webhook destination as `<PUBLIC_CONVEX_SITE_URL>/webhooks/privy`. Subscribe to intent, wallet-action transfer, transaction, deposit/withdrawal, wallet-security, and MFA events.
10. Configure Base Sepolia sponsorship if used, fund the treasury with test ETH and Circle Base Sepolia USDC, then complete the opt-in smoke sequence.

For RSA rotation, generate a new key/kid, publish old and new public JWKs together, switch the signing private key/kid, wait longer than the five-minute JWT lifetime, then remove the old JWK.
