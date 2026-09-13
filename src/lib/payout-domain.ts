import {
	BASE_SEPOLIA,
	assetDecimals,
	decimalToUnits,
	normalizeDecimal,
	normalizeEvmAddress,
	unitsToDecimal
} from './domain';
import type { Asset } from './domain';

export type PayoutRunKind = 'batch' | 'payroll';
export type PayoutItemStatus =
	| 'ready'
	| 'queued'
	| 'pendingApproval'
	| 'processing'
	| 'succeeded'
	| 'failed'
	| 'ambiguous'
	| 'cancelled';

export type ProviderAttemptStatus =
	'pending' | 'claimed' | 'submitted' | 'ambiguous' | 'confirmed' | 'failed';

const attemptTransitions: Record<ProviderAttemptStatus, readonly ProviderAttemptStatus[]> = {
	pending: ['claimed'],
	claimed: ['submitted', 'ambiguous', 'failed'],
	submitted: ['confirmed', 'ambiguous', 'failed'],
	ambiguous: ['submitted', 'confirmed', 'failed'],
	confirmed: [],
	failed: []
};

export function normalizePayoutRunKey(value: string) {
	const key = value.trim();
	if (!/^[A-Za-z0-9:_-]{12,100}$/.test(key)) throw new Error('Invalid payout run key.');
	return key;
}

export function payoutItemRequestKey(
	kind: PayoutRunKind,
	runKey: string,
	revision: number,
	index: number
) {
	const normalizedKey = normalizePayoutRunKey(runKey);
	if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid payout revision.');
	if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid payout item index.');
	return `${kind}:${normalizedKey}:${revision}:${index}`;
}

export function payoutAttemptKey(operationId: string, attempt = 1) {
	if (!operationId.trim()) throw new Error('Operation ID is required.');
	if (!Number.isSafeInteger(attempt) || attempt < 1) throw new Error('Invalid payout attempt.');
	return `operation:${operationId}:submit:${attempt}`;
}

export function totalPayoutAmount(values: readonly string[], asset: Asset = 'USDC') {
	const decimals = assetDecimals(asset);
	let units = 0n;
	for (const value of values) {
		const amount = normalizeDecimal(value, decimals);
		if (amount === '0') throw new Error('Payout amounts must be greater than zero.');
		units += decimalToUnits(amount, decimals);
	}
	return unitsToDecimal(units.toString(), decimals);
}

export function assertUniquePayrollMembers(userIds: readonly string[]) {
	const unique = new Set(userIds);
	if (unique.size !== userIds.length)
		throw new Error('A payroll run cannot include a member twice.');
}

export function canTransitionProviderAttempt(
	from: ProviderAttemptStatus,
	to: ProviderAttemptStatus
) {
	return attemptTransitions[from].includes(to);
}

export function aggregatePayoutRunStatus(statuses: readonly PayoutItemStatus[]) {
	if (!statuses.length) return 'draft' as const;
	if (statuses.some((status) => status === 'ambiguous')) return 'needsAttention' as const;
	if (statuses.every((status) => status === 'succeeded')) return 'completed' as const;
	const terminal = statuses.every((status) =>
		['succeeded', 'failed', 'cancelled'].includes(status)
	);
	if (terminal && statuses.some((status) => status === 'succeeded'))
		return 'partiallyCompleted' as const;
	if (terminal) return 'failed' as const;
	if (statuses.every((status) => status === 'ready')) return 'ready' as const;
	return 'processing' as const;
}

export function activeAutomationPolicyAllows(input: {
	policies: ReadonlyArray<{ kind: string; status: string; json: unknown; privyPolicyId: string }>;
	walletPolicyIds: readonly string[];
	amount: string;
	destination: string;
	asset?: Asset;
}) {
	const asset = input.asset ?? 'USDC';
	if (asset !== 'USDC') return false;
	const destination = normalizeEvmAddress(input.destination);
	const amount = decimalToUnits(input.amount, 6);
	for (const policy of input.policies) {
		if (
			policy.kind !== 'signerOverride' ||
			policy.status !== 'active' ||
			!input.walletPolicyIds.includes(policy.privyPolicyId)
		)
			continue;
		const document = asRecord(policy.json);
		const rules = Array.isArray(document?.rules) ? document.rules : [];
		for (const candidate of rules) {
			const rule = asRecord(candidate);
			if (rule?.method !== 'transfer' || rule.action !== 'ALLOW') continue;
			const conditions = Array.isArray(rule.conditions) ? rule.conditions.map(asRecord) : [];
			const assetAllowed = hasStringCondition(conditions, 'source.asset', 'eq', 'usdc');
			const chainAllowed = hasStringCondition(
				conditions,
				'source.chain',
				'eq',
				BASE_SEPOLIA.transferChain
			);
			const destinationAllowed = conditions.some((condition) => {
				if (condition?.field !== 'destination.address') return false;
				if (condition.operator === 'eq' && typeof condition.value === 'string')
					return addressesEqual(condition.value, destination);
				if (condition.operator === 'in' && Array.isArray(condition.value))
					return condition.value.some(
						(value) => typeof value === 'string' && addressesEqual(value, destination)
					);
				return false;
			});
			const limit = conditions.find(
				(condition) => condition?.field === 'source.amount' && condition.operator === 'lte'
			)?.value;
			try {
				if (
					assetAllowed &&
					chainAllowed &&
					destinationAllowed &&
					typeof limit === 'string' &&
					amount <= decimalToUnits(limit, 6)
				)
					return true;
			} catch {
				// A malformed local policy must never grant automation authority.
			}
		}
	}
	return false;
}

export function activeSweepPolicyAllows(input: {
	policies: ReadonlyArray<{ kind: string; status: string; json: unknown; privyPolicyId: string }>;
	walletPolicyIds: readonly string[];
	asset: Asset;
	destination: string;
}) {
	const destination = normalizeEvmAddress(input.destination);
	for (const policy of input.policies) {
		if (
			policy.kind !== 'sweep' ||
			policy.status !== 'active' ||
			!input.walletPolicyIds.includes(policy.privyPolicyId)
		)
			continue;
		const document = asRecord(policy.json);
		const rules = Array.isArray(document?.rules) ? document.rules : [];
		for (const candidate of rules) {
			const rule = asRecord(candidate);
			if (rule?.method !== 'transfer' || rule.action !== 'ALLOW') continue;
			const conditions = Array.isArray(rule.conditions) ? rule.conditions.map(asRecord) : [];
			if (
				hasStringCondition(conditions, 'source.asset', 'eq', input.asset.toLowerCase()) &&
				hasStringCondition(conditions, 'source.chain', 'eq', BASE_SEPOLIA.transferChain) &&
				conditions.some(
					(condition) =>
						condition?.field === 'destination.address' &&
						condition.operator === 'eq' &&
						typeof condition.value === 'string' &&
						addressesEqual(condition.value, destination)
				)
			)
				return true;
		}
	}
	return false;
}

export function assertAutomationExecutionBinding(input: {
	organizationActive: boolean;
	organizationId: string;
	keyId: string;
	principals: ReadonlyArray<{
		organizationId: string;
		privyAuthorizationKeyId: string;
		status: string;
	}>;
	walletOrganizationId: string;
	walletChainId: number;
	walletSignerIds: readonly string[];
	walletPolicyIds: readonly string[];
	policies: ReadonlyArray<{ kind: string; status: string; json: unknown; privyPolicyId: string }>;
	asset: string;
	amount: string;
	destination: string;
}) {
	if (
		!input.organizationActive ||
		input.walletOrganizationId !== input.organizationId ||
		input.walletChainId !== BASE_SEPOLIA.chainId
	)
		throw new Error('automation_organization_binding_invalid');
	const principal = input.principals.find(
		(candidate) =>
			candidate.organizationId === input.organizationId &&
			candidate.status === 'active' &&
			candidate.privyAuthorizationKeyId === input.keyId
	);
	if (!principal || !input.walletSignerIds.includes(input.keyId))
		throw new Error('automation_signer_binding_invalid');
	if (
		input.asset !== 'USDC' ||
		!activeAutomationPolicyAllows({
			policies: input.policies,
			walletPolicyIds: input.walletPolicyIds,
			amount: input.amount,
			destination: input.destination,
			asset: input.asset as Asset
		})
	)
		throw new Error('automation_policy_binding_invalid');
}

function hasStringCondition(
	conditions: Array<Record<string, unknown> | undefined>,
	field: string,
	operator: string,
	value: string
) {
	return conditions.some(
		(condition) =>
			condition?.field === field && condition.operator === operator && condition.value === value
	);
}

function addressesEqual(left: string, right: string) {
	try {
		return normalizeEvmAddress(left) === normalizeEvmAddress(right);
	} catch {
		return false;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}
