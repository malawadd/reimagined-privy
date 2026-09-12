import { describe, expect, it } from 'vitest';
import {
	providerIntentProgress,
	providerIntentType,
	providerOperationStatus,
	providerResourceId
} from './privy';

describe('Privy response normalization', () => {
	it('accepts native intent identifiers and types', () => {
		const intent = { intent_id: 'intent_live_01', intent_type: 'TRANSFER', status: 'pending' };
		expect(providerResourceId(intent)).toBe('intent_live_01');
		expect(providerIntentType(intent, 'UNKNOWN')).toBe('TRANSFER');
		expect(providerOperationStatus(intent)).toBe('pendingApproval');
	});

	it('computes approval progress from authorization details', () => {
		expect(
			providerIntentProgress({
				authorization_details: [
					{
						threshold: 2,
						members: [
							{ type: 'user', signed_at: 123 },
							{ type: 'user', signed_at: null },
							{ type: 'user', signed_at: null }
						]
					}
				]
			})
		).toEqual({ approvals: 1, threshold: 2 });
	});

	it('uses the nested wallet action status after an intent executes', () => {
		expect(
			providerOperationStatus({
				intent_id: 'intent_live_02',
				status: 'executed',
				action_result: { response_body: { status: 'pending' } }
			})
		).toBe('pendingConfirmation');
	});
});
