import { getAddress, isAddress } from 'viem';
import { z } from 'zod';

export const BASE_SEPOLIA = {
	chainId: 84532,
	caip2: 'eip155:84532',
	transferChain: 'base_sepolia',
	usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
} as const;

export const orgRoles = ['owner', 'admin', 'operator', 'approver', 'auditor'] as const;
export type OrgRole = (typeof orgRoles)[number];

export const operationKinds = [
	'payment',
	'treasuryTransfer',
	'walletUpdate',
	'quorumUpdate',
	'policyUpdate',
	'automationRun'
] as const;
export type OperationKind = (typeof operationKinds)[number];

export const approvalPaths = ['automationSigner', 'privyIntent'] as const;
export type ApprovalPath = (typeof approvalPaths)[number];

export const operationStatuses = [
	'draft',
	'queued',
	'pendingApproval',
	'executing',
	'pendingConfirmation',
	'succeeded',
	'rejected',
	'expired',
	'failed',
	'cancelled'
] as const;
export type OperationStatus = (typeof operationStatuses)[number];

export type Asset = 'ETH' | 'USDC';

export interface PaymentDraft {
	asset: Asset;
	amount: string;
	destination: string;
	recipientApproved: boolean;
}

export interface RouteDecision {
	path: ApprovalPath | 'blocked';
	reason: string;
	requiresPolicyChange: boolean;
}

const decimalPattern = /^\d+(?:\.\d+)?$/;

export function normalizeDecimal(value: string, decimals: number): string {
	const input = value.trim();
	if (!decimalPattern.test(input)) throw new Error('Enter a positive decimal amount.');
	const [whole, fraction = ''] = input.split('.');
	if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimals.`);
	const normalizedFraction = fraction.replace(/0+$/, '');
	return normalizedFraction ? `${BigInt(whole)}.${normalizedFraction}` : BigInt(whole).toString();
}

export function decimalToUnits(value: string, decimals: number): bigint {
	const normalized = normalizeDecimal(value, decimals);
	const [whole, fraction = ''] = normalized.split('.');
	return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

export function unitsToDecimal(rawValue: string, decimals: number): string {
	if (!/^\d+$/.test(rawValue)) throw new Error('Raw amount must be a non-negative integer string.');
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36)
		throw new Error('Asset decimals must be an integer between 0 and 36.');
	if (decimals === 0) return BigInt(rawValue).toString();
	const padded = rawValue.padStart(decimals + 1, '0');
	const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '') || '0';
	const fraction = padded.slice(-decimals).replace(/0+$/, '');
	return fraction ? `${whole}.${fraction}` : whole;
}

export function normalizeEvmAddress(value: string): `0x${string}` {
	if (!isAddress(value, { strict: true }))
		throw new Error('Enter a valid checksummed or lowercase EVM address.');
	return getAddress(value);
}

export function selectPaymentRoute(input: PaymentDraft): RouteDecision {
	const amount = decimalToUnits(input.amount, input.asset === 'USDC' ? 6 : 18);
	if (amount <= 0n) {
		return {
			path: 'blocked',
			reason: 'The transfer amount must be greater than zero.',
			requiresPolicyChange: false
		};
	}
	if (input.asset === 'USDC' && input.recipientApproved && amount <= 100_000_000n) {
		return {
			path: 'automationSigner',
			reason: 'Approved recipient and amount is within the 100 USDC automation ceiling.',
			requiresPolicyChange: false
		};
	}
	if (input.asset === 'USDC' || input.asset === 'ETH') {
		return {
			path: 'privyIntent',
			reason: 'Owner quorum approval is required for this transfer.',
			requiresPolicyChange: false
		};
	}
	return {
		path: 'blocked',
		reason: 'The owner policy does not allow this request.',
		requiresPolicyChange: true
	};
}

export const paymentSchema = z.object({
	asset: z.enum(['ETH', 'USDC']),
	amount: z.string().transform((value) => normalizeDecimal(value, 18)),
	destination: z.string().transform(normalizeEvmAddress),
	recipientApproved: z.boolean(),
	memo: z.string().trim().max(140).optional(),
	reference: z.string().trim().min(1).max(80)
});

const allowedTransitions: Record<OperationStatus, readonly OperationStatus[]> = {
	draft: ['queued', 'cancelled'],
	queued: ['pendingApproval', 'executing', 'failed', 'cancelled'],
	pendingApproval: ['executing', 'rejected', 'expired', 'failed'],
	executing: ['pendingConfirmation', 'succeeded', 'failed'],
	pendingConfirmation: ['succeeded', 'failed'],
	succeeded: [],
	rejected: [],
	expired: [],
	failed: [],
	cancelled: []
};

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
	return allowedTransitions[from].includes(to);
}

const rank: Record<OperationStatus, number> = {
	draft: 0,
	queued: 1,
	pendingApproval: 2,
	executing: 3,
	pendingConfirmation: 4,
	succeeded: 5,
	rejected: 5,
	expired: 5,
	failed: 5,
	cancelled: 5
};

export function monotonicStatus(
	current: OperationStatus,
	incoming: OperationStatus
): OperationStatus {
	if (rank[incoming] < rank[current]) return current;
	if (rank[incoming] === rank[current] && current !== incoming) return current;
	return incoming;
}

export function deterministicRunKey(automationId: string, trigger: string | number): string {
	return `${automationId}:${String(trigger).trim()}`;
}
