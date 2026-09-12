import { decimalToUnits, normalizeDecimal, normalizeEvmAddress, unitsToDecimal } from './domain';

export type WalletPermission = 'view' | 'initiate' | 'approve' | 'manage';
const permissionOrder: WalletPermission[] = ['view', 'initiate', 'approve', 'manage'];

export function normalizeInvitationEmail(value: string) {
	const email = value.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
	return email;
}

const PRIVY_KEY_QUORUM_NAME_LIMIT = 50;
const PRIVY_POLICY_NAME_LIMIT = 50;

export function privyKeyQuorumDisplayName(walletName: string, runKey: string) {
	const suffix =
		runKey
			.split(':')
			.at(-1)
			?.replace(/[^a-zA-Z0-9_-]/g, '')
			.slice(-12) || 'provisioning';
	const prefix = 'Ratib ';
	const availableNameLength = PRIVY_KEY_QUORUM_NAME_LIMIT - prefix.length - suffix.length - 1;
	return `${prefix}${walletName.trim().slice(0, availableNameLength)} ${suffix}`;
}

export function privyPolicyName(walletName: string) {
	return `${walletName.trim()} Base Sepolia controls`.slice(0, PRIVY_POLICY_NAME_LIMIT);
}

export function privyWalletExternalId(runKey: string) {
	const requestKey =
		runKey
			.split(':')
			.at(-1)
			?.replace(/[^a-zA-Z0-9_-]/g, '') || '';
	if (!requestKey) throw new Error('Provisioning run key cannot produce a Privy external ID.');
	return `ratib_${requestKey}`.slice(0, 64);
}

export function privyUserIdsEqual(left: string, right: string) {
	return left.replace(/^did:privy:/, '') === right.replace(/^did:privy:/, '');
}

export function privyIntentSignaturePayload(input: {
	appId: string;
	intentId: string;
	timestamp: number;
	expiresAt?: number | null;
	request: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; body?: unknown };
}) {
	return {
		version: 1 as const,
		method: input.request.method,
		url: input.request.url,
		body: input.request.body ?? {},
		timestamp: input.timestamp,
		intent_id: input.intentId,
		headers: {
			'privy-app-id': input.appId,
			...(input.expiresAt ? { 'privy-request-expiry': String(input.expiresAt) } : {})
		}
	};
}

export function canonicalWalletPermissions(values: readonly WalletPermission[]) {
	const unique = new Set(values);
	return permissionOrder.filter((permission) => unique.has(permission));
}

export function assertSatisfiableQuorum(threshold: number, reviewerCount: number) {
	if (!Number.isSafeInteger(threshold) || threshold < 1)
		throw new Error('Approval threshold must be a positive integer.');
	if (!Number.isSafeInteger(reviewerCount) || reviewerCount < threshold)
		throw new Error('This change would make the wallet quorum unsatisfiable.');
}

export function totalUsdc(values: readonly string[]) {
	let total = 0n;
	for (const value of values) {
		const normalized = normalizeDecimal(value, 6);
		if (normalized === '0') throw new Error('Payroll amounts must be greater than zero.');
		total += decimalToUnits(normalized, 6);
	}
	return unitsToDecimal(total.toString(), 6);
}

export function resolvePayrollDestination(input: {
	eligibility: 'active' | 'paused';
	destinationKind?: 'personal' | 'external';
	personalAddress?: string;
	externalAddress?: string;
	externalVerifiedAt?: number;
}) {
	if (input.eligibility !== 'active') throw new Error('Member is not payroll eligible.');
	if (input.destinationKind === 'personal' && input.personalAddress)
		return normalizeEvmAddress(input.personalAddress);
	if (input.destinationKind === 'external' && input.externalAddress && input.externalVerifiedAt)
		return normalizeEvmAddress(input.externalAddress);
	throw new Error('Member has no verified salary destination.');
}
