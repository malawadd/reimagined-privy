import { describe, expect, it } from 'vitest';
import walletFixture from './fixtures/privy/wallet.json';
import intentFixture from './fixtures/privy/transfer-intent.json';
import webhookFixture from './fixtures/privy/wallet-action-webhook.json';
import quorumFixture from './fixtures/privy/key-quorum.json';
import policyFixture from './fixtures/privy/owner-policy.json';
import quorumIntentFixture from './fixtures/privy/quorum-intent.json';
import intentAuthorizedFixture from './fixtures/privy/intent-authorized-webhook.json';

describe('sanitized Privy provider contracts', () => {
	it('retains wallet identity fields used by the mirror', () => {
		expect(walletFixture).toMatchObject({
			id: expect.stringMatching(/^wallet_/),
			chain_type: 'ethereum',
			address: expect.stringMatching(/^0x/)
		});
	});
	it('retains native transfer intent lifecycle fields', () => {
		expect(intentFixture).toMatchObject({
			intent_id: expect.stringMatching(/^intent_/),
			intent_type: 'TRANSFER',
			status: 'pending'
		});
	});
	it('retains webhook deduplication and monotonic status fields', () => {
		expect(webhookFixture).toHaveProperty('idempotency_key');
		expect(webhookFixture.data).toHaveProperty('status', 'confirmed');
	});
	it('retains user quorum and owner-policy provisioning contracts', () => {
		expect(quorumFixture).toMatchObject({
			id: expect.stringMatching(/^key_quorum_/),
			authorization_threshold: 1,
			user_ids: [expect.stringMatching(/^did:privy:/)]
		});
		expect(policyFixture).toMatchObject({
			id: expect.stringMatching(/^policy_/),
			owner_id: quorumFixture.id,
			chain_type: 'ethereum'
		});
	});
	it('retains request details and signer timestamps for embedded intent approval', () => {
		expect(quorumIntentFixture).toMatchObject({
			intent_type: 'KEY_QUORUM',
			request_details: { method: 'PATCH', url: expect.stringContaining('/v1/key_quorums/') }
		});
		expect(intentAuthorizedFixture).toMatchObject({ type: 'intent.authorized' });
		expect(intentAuthorizedFixture.data.authorization_details[0].members[0].signed_at).toEqual(
			expect.any(Number)
		);
	});
});
