# Security model

## Secret boundary

Only public Privy application/client IDs and Convex URLs may use `PUBLIC_*`. The Privy app secret, backend authorization private key, webhook signing key, access-token verification key, Convex JWT private key, and developer-webhook signing key belong only in Convex environment variables. They must not appear in Svelte code, database documents, fixtures, logs, exceptions, analytics, or CI output.

Prototype exception: when an organization admin explicitly selects **Save credential in Ratib**, an ERPNext API key and secret may be encrypted inside a Node action with AES-256-GCM and a versioned Convex-only wrapping key. Convex stores ciphertext, IV, authentication tag, key version, and a non-secret hint/fingerprint. Public queries never return ciphertext; disconnect erases it. This exception does not apply to Privy secrets, wallet authorization keys, JWT keys, webhook signing keys, or authorization signatures.

The repository's fixtures contain synthetic IDs, addresses, and hashes. Audit metadata passes through recursive key-name redaction before insertion.

## Layered authorization

Application RBAC limits who can request operations. Privy owners, signer policies, and reviewer quorum decide what can execute. These layers are intentionally not synchronized into one role system. Removing an app approver does not remove a Privy reviewer; both control planes must be administered.

All policies are default-deny. Enable exact chain, method, asset/contract, amount, and destination conditions. Keep policy-management keys separate from transaction signers. In-app Privy quorum members must use MFA.

## Threat checks

- Cross-tenant ID: fetched record must match the already-authorized organization.
- Role escalation: roles come only from membership documents, never request bodies or JWT custom claims.
- Replay: webhooks use Svix verification and message deduplication; provider attempts and API writes use deterministic keys and signed nonces.
- Connector SSRF: ERPNext and outbound-webhook hosts must resolve to public addresses; redirects are origin constrained or rejected.
- Out-of-order event: operation state can advance but cannot regress.
- Double spend on timeout: mark ambiguous and reconcile by provider reference before retrying.
- Bundle leak: no server SDK or secret environment name is imported by client routes.
- Incomplete production configuration: `pnpm build:production` rejects missing public integration values and non-HTTPS Convex endpoints; backend provider calls fail closed when Convex secrets are absent.

Before mainnet expansion, add independent security review, transaction simulation, recipient risk/compliance controls, incident runbooks, monitoring, and spend alerts. Mainnet is intentionally disabled here.
