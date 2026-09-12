import { describe, expect, it } from 'vitest';
import walletFixture from './fixtures/privy/wallet.json';
import intentFixture from './fixtures/privy/transfer-intent.json';
import webhookFixture from './fixtures/privy/wallet-action-webhook.json';

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
			id: expect.stringMatching(/^intent_/),
			type: 'TRANSFER',
			status: 'pending'
		});
	});
	it('retains webhook deduplication and monotonic status fields', () => {
		expect(webhookFixture).toHaveProperty('idempotency_key');
		expect(webhookFixture.data).toHaveProperty('status', 'confirmed');
	});
});
