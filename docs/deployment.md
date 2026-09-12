# Deployment

Use distinct Privy and Convex projects, credentials, authorization keys, webhook keys, and funding for development and production.

Set the four browser-safe variables on the SvelteKit host with `PUBLIC_PRIVY_MODE=live`. Set every server secret directly in the production Convex project. Configure an adapter suitable for the chosen SvelteKit platform; `adapter-auto` is only the portable starter default.

Run `pnpm check`, `pnpm lint`, `pnpm test`, and `pnpm build:production`. The last command rejects mock mode, missing public IDs/URLs, and an insecure Convex site URL. Deploy Convex functions before the frontend so token exchange and webhook routes exist when the UI becomes reachable.

After deployment, confirm allowed origins and OAuth redirects in Privy, send a signed webhook test, fund only Base Sepolia wallets, create one small automation transfer, and verify its action, transaction hash, and audit correlation. Do not deploy the showcase with development authorization keys or test webhook secrets.
