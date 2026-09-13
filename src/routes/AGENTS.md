# Frontend guidance

The console uses Svelte 5 runes, SSR for public/login routes, and client-side Privy initialization for authenticated routes. Keep `@privy-io/js-sdk-core` isolated in `lib/auth/privy.svelte.ts`; never import it throughout UI components.

Use shadcn-svelte conventions: small accessible primitives, semantic HTML, visible focus, and tokens in `layout.css`. Preserve the neutral blue/green enterprise palette and responsive behavior. Status must never rely on color alone. Show Base Sepolia and live-provider state persistently.

Route previews are explanatory. Always label Privy as final authority. Approval, policy, quorum, and MFA workflows stay inside Ratib; do not send customers to Privy's Dashboard.

Authenticated screens may hide actions according to application RBAC, but must assume the server will independently deny unauthorized calls. Mock data is presentation-only and must not be imported into Convex code.
