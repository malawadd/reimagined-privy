import { describe, expect, it } from 'vitest';
import { compileTreasuryPolicy } from './policy';
import { BASE_SEPOLIA } from './domain';

describe('policy compiler', () => {
	it('is default-deny and binds the signer to Base Sepolia USDC recipients', () => {
		const result = compileTreasuryPolicy({
			approvedRecipients: ['0xabc'],
			treasuryDestination: '0xdef'
		});
		expect(result.default_action).toBe('deny');
		expect(result.rules[1]).toMatchObject({
			chain_id: 84532,
			contract: BASE_SEPOLIA.usdc,
			recipients: ['0xabc'],
			max_amount: '100'
		});
	});
});
