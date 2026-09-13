# Ratib v1 SDKs

These checked-in clients are generated around `docs/api/ratib-v1.openapi.yaml` and implement
Ratib's canonical P-256 request signature. They never approve Privy intents or hold wallet signing
authority.

- TypeScript: `typescript/ratib.ts`, using Web Crypto and Fetch from modern browsers or Node 22.
- Python: `python/ratib.py`, requiring `cryptography>=42`.

Create a service account from Ratib's Developers screen, store the one-time private JWK in the
calling system's secret store, and pass the Convex HTTP origin as `baseUrl`. Reuse an
`Idempotency-Key` only for an identical write body.
