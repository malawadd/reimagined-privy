import { describe, expect, it } from 'vitest';
import {
	assertSatisfiableQuorum,
	canonicalWalletPermissions,
	normalizeInvitationEmail,
	privyIntentSignaturePayload,
	privyKeyQuorumDisplayName,
	privyPolicyName,
	privyUserIdsEqual,
	privyWalletExternalId,
	resolvePayrollDestination,
	totalUsdc
} from './wallet-controls';

describe('wallet and payroll controls', () => {
	it('normalizes invitation emails and rejects malformed values', () => {
		expect(normalizeInvitationEmail('  Finance@Example.COM ')).toBe('finance@example.com');
		expect(() => normalizeInvitationEmail('not-an-email')).toThrow('valid email');
	});

	it('deduplicates wallet permissions in stable order', () => {
		expect(canonicalWalletPermissions(['approve', 'view', 'approve', 'manage'])).toEqual([
			'view',
			'approve',
			'manage'
		]);
	});

	it('prevents unsatisfiable approval thresholds', () => {
		expect(() => assertSatisfiableQuorum(2, 1)).toThrow('unsatisfiable');
		expect(() => assertSatisfiableQuorum(0, 2)).toThrow('positive integer');
		expect(() => assertSatisfiableQuorum(2, 2)).not.toThrow();
	});

	it('totals USDC without floating point', () => {
		expect(totalUsdc(['0.100001', '2.9', '7'])).toBe('10.000001');
		expect(() => totalUsdc(['0'])).toThrow('greater than zero');
	});

	it('resolves only active, verified payout destinations', () => {
		const address = '0x0000000000000000000000000000000000000001';
		expect(
			resolvePayrollDestination({
				eligibility: 'active',
				destinationKind: 'external',
				externalAddress: address,
				externalVerifiedAt: Date.now()
			})
		).toBe(address);
		expect(() =>
			resolvePayrollDestination({
				eligibility: 'paused',
				destinationKind: 'external',
				externalAddress: address,
				externalVerifiedAt: Date.now()
			})
		).toThrow('not payroll eligible');
	});
});

describe('Privy provisioning inputs', () => {
	const runKey = 'wallet:k17dsymqjh6ck8w862y2thg8w98e995x:91a90622-155e-46c6-b624-aa34c555e2db';

	it('keeps quorum and policy names within provider limits', () => {
		const quorumName = privyKeyQuorumDisplayName(
			'A very long organization treasury wallet name',
			runKey
		);
		expect(quorumName.length).toBeLessThanOrEqual(50);
		expect(quorumName).toContain('aa34c555e2db');
		expect(privyPolicyName('A'.repeat(100))).toHaveLength(50);
	});

	it('creates a URL-safe, stable wallet external ID', () => {
		const externalId = privyWalletExternalId(runKey);
		expect(externalId).toBe('ratib_91a90622-155e-46c6-b624-aa34c555e2db');
		expect(externalId).toMatch(/^[a-zA-Z0-9_-]+$/);
		expect(externalId.length).toBeLessThanOrEqual(64);
	});

	it('matches provider user IDs with and without the Privy DID prefix', () => {
		expect(
			privyUserIdsEqual('did:privy:cmtxxmjf0002c0cjm34xkh9fd', 'cmtxxmjf0002c0cjm34xkh9fd')
		).toBe(true);
		expect(privyUserIdsEqual('did:privy:one', 'two')).toBe(false);
	});

	it('binds the underlying Privy request signature to its intent and timestamp', () => {
		expect(
			privyIntentSignaturePayload({
				appId: 'app-id',
				intentId: 'intent-id',
				timestamp: 1_789_561_852_861,
				request: {
					method: 'PATCH',
					url: 'https://api.privy.io/v1/wallets/wallet-id',
					body: { display_name: 'Operating Treasury' }
				}
			})
		).toEqual({
			version: 1,
			method: 'PATCH',
			url: 'https://api.privy.io/v1/wallets/wallet-id',
			body: { display_name: 'Operating Treasury' },
			timestamp: 1_789_561_852_861,
			intent_id: 'intent-id',
			headers: { 'privy-app-id': 'app-id' }
		});
	});
});
