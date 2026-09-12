import { describe, expect, it } from 'vitest';
import { compileOwnerPolicy, compileTreasuryPolicy } from './policy';

describe('policy compiler', () => {
	it('uses Privy transfer-action fields and binds the signer to Base Sepolia USDC', () => {
		const result = compileTreasuryPolicy({
			approvedRecipients: ['0x1111111111111111111111111111111111111111'],
			treasuryDestination: '0x2222222222222222222222222222222222222222'
		});
		expect(result).not.toHaveProperty('default_action');
		expect(result.rules[0]).toMatchObject({
			method: 'transfer',
			action: 'ALLOW',
			conditions: expect.arrayContaining([
				expect.objectContaining({ field: 'source.chain', value: 'base_sepolia' }),
				expect.objectContaining({ field: 'source.amount', operator: 'lte', value: '100' }),
				expect.objectContaining({
					field: 'destination.address',
					value: ['0x1111111111111111111111111111111111111111']
				})
			])
		});
	});

	it('creates an owner policy limited to the two v1 assets on Base Sepolia', () => {
		const policy = compileOwnerPolicy();
		expect(policy.rules).toHaveLength(2);
		expect(policy.rules.map((rule) => rule.method)).toEqual(['transfer', 'transfer']);
		expect(policy.rules.map((rule) => rule.conditions[0].value)).toEqual(['eth', 'usdc']);
	});
});
