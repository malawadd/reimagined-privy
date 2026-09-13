# Demo script

1. Sign in with email OTP or Google and call out the persistent Base Sepolia/live banner.
2. On Overview, show treasury balances, the pending reviewer queue, automation health, and linked activity.
3. Open Wallets and explain the 2-of-3 MFA reviewer owner, separate automation signer, signer overrides, and default-deny posture.
4. Create an 84 USDC payout to an approved recipient. Show the route preview select the automation signer, submit it, then follow wallet action and transaction confirmation.
5. Change the amount to 4,800 USDC. Show routing to a native `TRANSFER` intent, its expiry and approval count, then authorize it from Ratib's Approvals page.
6. In Policies, adjust a ceiling or recipient and show generated JSON. Submit the change and show that a policy intent—not a direct update—is created.
7. In Automations, show the recurring vendor template and deposit-triggered sweep. Trigger one run, highlight the deterministic run key and service principal.
8. In Team, contrast application roles with Privy reviewer authority.
9. Finish in Audit: search the correlation ID and trace user request → intent/action → webhook → transaction → final state.
