# Live foundation

Observation date: 2026-09-12

## Confirmed patterns

- Privy exposes browser authentication and server-side wallet infrastructure as separate concerns. Ratib exchanges a verified Privy access token for a five-minute Convex JWT and never trusts client role claims.
- Convex custom JWT auth resolves identity inside server functions. Business reads and writes then resolve the local user and active organization membership before capability checks.
- Competitor onboarding commonly gates treasury functionality behind business verification or sales access. Ratib activates self-service Base Sepolia organizations immediately while clearly labeling regulated KYB, fiat, and mainnet capabilities as unavailable.

## Ratib decision

The public site and login are available without business data. All application routes use live Privy authentication and live Convex queries. Empty and unavailable states are first-class; there is no runtime demo user, test OTP, seeded balance, or provider fallback.

## Sources

- https://docs.privy.io/recipes/core-js
- https://docs.convex.dev/auth/advanced/custom-jwt
- https://docs.convex.dev/auth/custom-auth
- https://docs.privy.io/security/implementation-guide/security-checklist
