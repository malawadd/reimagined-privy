import { describe, expect, it } from 'vitest';
import { compileTreasuryPolicy } from './policy';
import {
	activeAutomationPolicyAllows,
	aggregatePayoutRunStatus,
	assertAutomationExecutionBinding,
	assertUniquePayrollMembers,
	canTransitionProviderAttempt,
	normalizePayoutRunKey,
	payoutAttemptKey,
	payoutItemRequestKey,
	totalPayoutAmount
} from './payout-domain';

const destination = '0x0000000000000000000000000000000000000002';
const treasury = '0x0000000000000000000000000000000000000001';
const policy = {
	kind: 'signerOverride',
	status: 'active',
	privyPolicyId: 'policy_automation',
	json: compileTreasuryPolicy({
		approvedRecipients: [destination],
		treasuryDestination: treasury,
		automationLimitUsdc: '100'
	})
};

describe('payout domain', () => {
	it('normalizes deterministic run, item, and attempt keys', () => {
		expect(normalizePayoutRunKey(' run_123456789 ')).toBe('run_123456789');
		expect(payoutItemRequestKey('payroll', 'run_123456789', 2, 3)).toBe(
			'payroll:run_123456789:2:3'
		);
		expect(payoutAttemptKey('operation_123', 2)).toBe('operation:operation_123:submit:2');
	});

	it('totals USDC exactly and rejects duplicate payroll members', () => {
		expect(totalPayoutAmount(['0.100001', '2.9', '7'])).toBe('10.000001');
		expect(() => totalPayoutAmount(['0'])).toThrow('greater than zero');
		expect(() => assertUniquePayrollMembers(['user_a', 'user_a'])).toThrow('member twice');
	});

	it('uses the active policy attached to the wallet as automation truth', () => {
		expect(
			activeAutomationPolicyAllows({
				policies: [policy],
				walletPolicyIds: ['policy_automation'],
				amount: '100',
				destination
			})
		).toBe(true);
		expect(
			activeAutomationPolicyAllows({
				policies: [policy],
				walletPolicyIds: ['policy_automation'],
				amount: '100.000001',
				destination
			})
		).toBe(false);
		expect(
			activeAutomationPolicyAllows({
				policies: [policy],
				walletPolicyIds: [],
				amount: '1',
				destination
			})
		).toBe(false);
	});

	it('requires a complete organization, principal, wallet, and policy automation binding', () => {
		const binding = {
			organizationActive: true,
			organizationId: 'org_1',
			keyId: 'key_automation',
			principals: [
				{
					organizationId: 'org_1',
					privyAuthorizationKeyId: 'key_automation',
					status: 'active'
				}
			],
			walletOrganizationId: 'org_1',
			walletChainId: 84532,
			walletSignerIds: ['key_automation'],
			walletPolicyIds: ['policy_automation'],
			policies: [policy],
			asset: 'USDC',
			amount: '80',
			destination
		};
		expect(() => assertAutomationExecutionBinding(binding)).not.toThrow();
		expect(() =>
			assertAutomationExecutionBinding({ ...binding, organizationActive: false })
		).toThrow('organization_binding_invalid');
		expect(() => assertAutomationExecutionBinding({ ...binding, walletSignerIds: [] })).toThrow(
			'signer_binding_invalid'
		);
		expect(() => assertAutomationExecutionBinding({ ...binding, walletPolicyIds: [] })).toThrow(
			'policy_binding_invalid'
		);
		expect(() => assertAutomationExecutionBinding({ ...binding, asset: 'ETH' })).toThrow(
			'policy_binding_invalid'
		);
	});

	it('aggregates partial and ambiguous payout runs without hiding risk', () => {
		expect(aggregatePayoutRunStatus(['succeeded', 'failed'])).toBe('partiallyCompleted');
		expect(aggregatePayoutRunStatus(['succeeded', 'ambiguous'])).toBe('needsAttention');
		expect(aggregatePayoutRunStatus(['ready', 'ready'])).toBe('ready');
	});

	it('only permits explicit provider-attempt transitions', () => {
		expect(canTransitionProviderAttempt('pending', 'claimed')).toBe(true);
		expect(canTransitionProviderAttempt('claimed', 'ambiguous')).toBe(true);
		expect(canTransitionProviderAttempt('ambiguous', 'confirmed')).toBe(true);
		expect(canTransitionProviderAttempt('confirmed', 'claimed')).toBe(false);
	});
});
