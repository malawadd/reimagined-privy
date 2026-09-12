# Security model

## Secret boundary

Only public Privy application/client IDs and Convex URLs may use `PUBLIC_*`. The Privy app secret, backend authorization private key, webhook signing key, access-token verification key, and Convex JWT private key belong only in Convex environment variables. They must not appear in Svelte code, database documents, fixtures, logs, exceptions, analytics, or CI output.

The repository's fixtures contain synthetic IDs, addresses, and hashes. Audit metadata passes through recursive key-name redaction before insertion.

## Layered authorization

Application RBAC limits who can request operations. Privy owners, signer policies, and reviewer quorum decide what can execute. These layers are intentionally not synchronized into one role system. Removing an app approver does not remove a Privy reviewer; both control planes must be administered.

All policies are default-deny. Enable exact chain, method, asset/contract, amount, and destination conditions. Keep policy-management keys separate from transaction signers. Dashboard reviewers must use MFA.

## Threat checks

- Cross-tenant ID: fetched record must match the already-authorized organization.
- Role escalation: roles come only from membership documents, never request bodies or JWT custom claims.
- Replay: webhooks use Svix verification and message deduplication; automation uses deterministic run keys.
- Out-of-order event: operation state can advance but cannot regress.
- Double spend on timeout: mark ambiguous and reconcile by provider reference before retrying.
- Bundle leak: no server SDK or secret environment name is imported by client routes.
- Test mode in production: `pnpm build:production` rejects mock mode, missing public integration values, and non-HTTPS Convex endpoints.

Before mainnet expansion, add independent security review, transaction simulation, recipient risk/compliance controls, incident runbooks, monitoring, and spend alerts. Mainnet is intentionally disabled here.
