import type { OperationStatus } from './domain';

type ProviderRecord = Record<string, unknown>;

export function providerResourceId(provider: ProviderRecord): string {
	const value = provider.id ?? provider.intent_id ?? provider.wallet_action_id;
	if (typeof value !== 'string' || !value.trim())
		throw new Error('Privy response did not include a resource ID.');
	return value;
}

export function providerIntentType(provider: ProviderRecord, fallback: string): string {
	const value = provider.intent_type ?? provider.type;
	return typeof value === 'string' && value ? value : fallback;
}

export function providerIntentProgress(provider: ProviderRecord) {
	const details = Array.isArray(provider.authorization_details)
		? (provider.authorization_details as ProviderRecord[])
		: [];
	const quorum = details[0];
	const members =
		quorum && Array.isArray(quorum.members) ? (quorum.members as ProviderRecord[]) : [];
	const approvals = members.filter((member) => {
		if (member.type === 'key_quorum') return member.threshold_met === true;
		return typeof member.signed_at === 'number';
	}).length;
	const threshold = typeof quorum?.threshold === 'number' ? quorum.threshold : 0;
	return { approvals, threshold };
}

export function providerOperationStatus(provider: ProviderRecord): OperationStatus | null {
	const actionResult = asRecord(provider.action_result);
	const responseBody = asRecord(actionResult?.response_body);
	const status = String(responseBody?.status ?? provider.status ?? '').toLowerCase();
	const isIntent =
		!responseBody &&
		(typeof provider.intent_id === 'string' || typeof provider.intent_type === 'string');

	if (['confirmed', 'completed', 'executed', 'succeeded', 'success'].includes(status))
		return 'succeeded';
	if (['rejected', 'dismissed'].includes(status)) return 'rejected';
	if (status === 'expired') return 'expired';
	if (['failed', 'error', 'reverted', 'abandoned'].includes(status)) return 'failed';
	if (['executing', 'approved', 'processing'].includes(status)) return 'executing';
	if (['preparing', 'queued', 'retrying', 'broadcasted', 'pending_confirmation'].includes(status))
		return 'pendingConfirmation';
	if (['pending', 'awaiting_approval'].includes(status))
		return isIntent ? 'pendingApproval' : 'pendingConfirmation';
	return null;
}

function asRecord(value: unknown): ProviderRecord | undefined {
	return value && typeof value === 'object' ? (value as ProviderRecord) : undefined;
}
