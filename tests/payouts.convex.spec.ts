import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api, internal } from '../src/convex/_generated/api';
import { compileTreasuryPolicy } from '../src/lib/policy';

const modules = import.meta.glob('../src/convex/**/*.ts');
const ownerDid = 'did:privy:payout-owner';
const approverDid = 'did:privy:payout-approver';
const memberAddress = '0x0000000000000000000000000000000000000002';
const treasuryAddress = '0x0000000000000000000000000000000000000001';

async function setupPayroll() {
	const t = convexTest(schema, modules);
	const owner = t.withIdentity({ subject: ownerDid, email: 'owner@example.com' });
	const approver = t.withIdentity({ subject: approverDid, email: 'approver@example.com' });
	const ownerId = await owner.mutation(api.users.syncCurrent, {});
	const approverId = await approver.mutation(api.users.syncCurrent, {});
	const ids = await t.run(async (ctx) => {
		const memberId = await ctx.db.insert('users', {
			privyDid: 'did:privy:payroll-member',
			email: 'member@example.com',
			name: 'Payroll Member',
			lastSeenAt: Date.now()
		});
		const organizationId = await ctx.db.insert('organizations', {
			name: 'Payout Co',
			slug: 'payout-co',
			createdByUserId: ownerId,
			active: true
		});
		await ctx.db.insert('memberships', {
			organizationId,
			userId: ownerId,
			role: 'owner',
			status: 'active'
		});
		await ctx.db.insert('memberships', {
			organizationId,
			userId: approverId,
			role: 'approver',
			status: 'active'
		});
		await ctx.db.insert('memberships', {
			organizationId,
			userId: memberId,
			role: 'operator',
			status: 'active'
		});
		const walletId = await ctx.db.insert('wallets', {
			organizationId,
			privyWalletId: 'wallet_payout',
			name: 'Payout Treasury',
			address: treasuryAddress,
			chainType: 'ethereum',
			chainId: 84532,
			ownerQuorumId: 'quorum_payout',
			signerIds: ['key_automation'],
			policyIds: ['policy_automation'],
			syncVersion: 1,
			syncedAt: Date.now(),
			purpose: 'treasury'
		});
		await ctx.db.insert('walletBalances', {
			organizationId,
			walletId,
			chainId: 84532,
			asset: 'USDC',
			rawValue: '1000000000',
			decimals: 6,
			displayValue: '1000',
			observedAt: Date.now()
		});
		await ctx.db.insert('walletBalances', {
			organizationId,
			walletId,
			chainId: 84532,
			asset: 'ETH',
			rawValue: '1000000000000000000',
			decimals: 18,
			displayValue: '1',
			observedAt: Date.now()
		});
		await ctx.db.insert('walletAssignments', {
			organizationId,
			walletId,
			userId: approverId,
			permissions: ['view', 'approve'],
			status: 'active',
			updatedAt: Date.now()
		});
		await ctx.db.insert('servicePrincipals', {
			organizationId,
			name: 'Ratib controlled automation',
			purpose: 'Policy-bounded Base Sepolia execution',
			privyAuthorizationKeyId: 'key_automation',
			status: 'active'
		});
		await ctx.db.insert('policies', {
			organizationId,
			privyPolicyId: 'policy_automation',
			name: 'Payout policy',
			version: 1,
			kind: 'signerOverride',
			json: compileTreasuryPolicy({
				approvedRecipients: [memberAddress],
				treasuryDestination: treasuryAddress,
				automationLimitUsdc: '100'
			}),
			status: 'active',
			createdAt: Date.now()
		});
		const verifiedAt = Date.now() - 1_000;
		const personalWalletId = await ctx.db.insert('personalWallets', {
			organizationId,
			userId: memberId,
			privyWalletId: 'wallet_member',
			address: memberAddress,
			chainId: 84532,
			verifiedAt,
			updatedAt: verifiedAt
		});
		const profileId = await ctx.db.insert('payrollProfiles', {
			organizationId,
			userId: memberId,
			eligibility: 'active',
			destinationKind: 'personal',
			personalWalletId,
			updatedAt: Date.now()
		});
		return { organizationId, walletId, memberId, profileId, verifiedAt };
	});
	return { t, owner, approver, approverId, ...ids };
}

async function createDispatchedPayroll(
	fixture: Awaited<ReturnType<typeof setupPayroll>>,
	input: { name: string; idempotencyKey: string; amount: string }
) {
	const draft = await fixture.owner.mutation(api.payouts.saveDraft, {
		organizationId: fixture.organizationId,
		type: 'payroll',
		name: input.name,
		sourceWalletId: fixture.walletId,
		idempotencyKey: input.idempotencyKey,
		payPeriodStart: '2026-09-01',
		payPeriodEnd: '2026-09-30',
		payDate: '2026-09-30',
		denominationCurrency: 'USD',
		items: [{ userId: fixture.memberId, amount: input.amount }]
	});
	await fixture.owner.mutation(api.payouts.finalize, {
		organizationId: fixture.organizationId,
		batchId: draft.batchId
	});
	await fixture.owner.mutation(api.payouts.submitForApproval, {
		organizationId: fixture.organizationId,
		batchId: draft.batchId
	});
	await fixture.approver.mutation(api.payouts.approve, {
		organizationId: fixture.organizationId,
		batchId: draft.batchId
	});
	const dispatched = await fixture.owner.mutation(api.payouts.dispatch, {
		organizationId: fixture.organizationId,
		batchId: draft.batchId
	});
	return { ...draft, ...dispatched };
}

describe('payout runs', () => {
	it('moves an immutable payroll draft through maker-checker release before provider dispatch', async () => {
		const fixture = await setupPayroll();
		const draft = await fixture.owner.mutation(api.payouts.saveDraft, {
			organizationId: fixture.organizationId,
			type: 'payroll',
			name: 'Controlled payroll',
			sourceWalletId: fixture.walletId,
			idempotencyKey: 'controlled_payroll_2026_09',
			payPeriodStart: '2026-09-01',
			payPeriodEnd: '2026-09-30',
			payDate: '2026-09-30',
			denominationCurrency: 'USD',
			items: [{ userId: fixture.memberId, amount: '80' }]
		});
		await fixture.owner.mutation(api.payouts.finalize, {
			organizationId: fixture.organizationId,
			batchId: draft.batchId
		});
		await fixture.owner.mutation(api.payouts.submitForApproval, {
			organizationId: fixture.organizationId,
			batchId: draft.batchId
		});
		await expect(
			fixture.owner.mutation(api.payouts.approve, {
				organizationId: fixture.organizationId,
				batchId: draft.batchId
			})
		).rejects.toThrow('creator cannot approve');
		await fixture.approver.mutation(api.payouts.approve, {
			organizationId: fixture.organizationId,
			batchId: draft.batchId
		});
		const beforeDispatch = await fixture.t.run(async (ctx) => ({
			batch: await ctx.db.get(draft.batchId),
			operations: await ctx.db.query('operations').collect(),
			attempts: await ctx.db.query('providerAttempts').collect(),
			journals: await ctx.db.query('journals').collect()
		}));
		expect(beforeDispatch.batch?.status).toBe('approved');
		expect(beforeDispatch.operations).toHaveLength(0);
		expect(beforeDispatch.attempts).toHaveLength(0);
		expect(beforeDispatch.journals).toEqual([
			expect.objectContaining({
				sourceKey: `payroll:${draft.batchId}:approved`,
				sourceType: 'payroll',
				status: 'posted'
			})
		]);
		const dispatched = await fixture.owner.mutation(api.payouts.dispatch, {
			organizationId: fixture.organizationId,
			batchId: draft.batchId
		});
		expect(dispatched.operationIds).toHaveLength(1);
		const stored = await fixture.t.run(async (ctx) => ({
			batch: await ctx.db.get(draft.batchId),
			item: await ctx.db.query('paymentBatchItems').unique(),
			attempt: await ctx.db.query('providerAttempts').unique()
		}));
		expect(stored.batch?.status).toBe('processing');
		expect(stored.item?.destinationVersion).toBe(fixture.verifiedAt);
		expect(stored.attempt?.status).toBe('pending');
	});

	it('versions compensation and snapshots earnings and deductions into the draft', async () => {
		const fixture = await setupPayroll();
		const first = await fixture.owner.mutation(api.compensation.set, {
			organizationId: fixture.organizationId,
			userId: fixture.memberId,
			employeeCode: 'EMP-7',
			department: 'Operations',
			baseAmount: '90',
			denominationCurrency: 'USD',
			payFrequency: 'monthly',
			effectiveFrom: '2026-09-01'
		});
		const draft = await fixture.owner.mutation(api.payouts.saveDraft, {
			organizationId: fixture.organizationId,
			type: 'payroll',
			name: 'Payslip payroll',
			sourceWalletId: fixture.walletId,
			idempotencyKey: 'payslip_payroll_2026_09',
			payPeriodStart: '2026-09-01',
			payPeriodEnd: '2026-09-30',
			payDate: '2026-09-30',
			denominationCurrency: 'USD',
			items: [
				{
					userId: fixture.memberId,
					earnings: [
						{ label: 'Base pay', amount: '90' },
						{ label: 'Bonus', amount: '10' }
					],
					deductions: [{ label: 'Advance', amount: '5' }]
				}
			]
		});
		const item = await fixture.t.run((ctx) =>
			ctx.db
				.query('paymentBatchItems')
				.withIndex('by_batch', (q) => q.eq('batchId', draft.batchId))
				.unique()
		);
		expect(item).toMatchObject({
			compensationProfileId: first,
			amount: '95',
			payslipSnapshot: {
				employeeCode: 'EMP-7',
				department: 'Operations',
				grossAmount: '100',
				deductionAmount: '5',
				netAmount: '95',
				compensationProfileVersion: 1
			}
		});
	});

	it('deduplicates payroll runs and freezes the verified member destination', async () => {
		const fixture = await setupPayroll();
		const input = {
			organizationId: fixture.organizationId,
			name: 'September payroll',
			type: 'payroll' as const,
			sourceWalletId: fixture.walletId,
			idempotencyKey: 'payroll_run_2026_09',
			payPeriodStart: '2026-09-01',
			payPeriodEnd: '2026-09-30',
			payDate: '2026-09-30',
			denominationCurrency: 'USD',
			items: [{ userId: fixture.memberId, amount: '80', memo: 'Salary' }]
		};
		const first = await fixture.owner.mutation(api.payouts.saveDraft, input);
		const replay = await fixture.owner.mutation(api.payouts.saveDraft, input);

		expect(replay).toMatchObject({
			batchId: first.batchId,
			revision: first.revision,
			deduplicated: true
		});
		const stored = await fixture.t.run(async (ctx) => ({
			batches: await ctx.db.query('paymentBatches').collect(),
			items: await ctx.db.query('paymentBatchItems').collect(),
			operations: await ctx.db.query('operations').collect(),
			attempts: await ctx.db.query('providerAttempts').collect()
		}));
		expect(stored.batches).toHaveLength(1);
		expect(stored.operations).toHaveLength(0);
		expect(stored.attempts).toHaveLength(0);
		expect(stored.items[0]).toMatchObject({
			userId: fixture.memberId,
			payrollProfileId: fixture.profileId,
			destination: memberAddress,
			destinationKind: 'personal',
			destinationVerifiedAt: fixture.verifiedAt,
			destinationVersion: fixture.verifiedAt
		});
	});

	it('routes payroll through a Privy intent when aggregate automation authority is absent', async () => {
		const fixture = await setupPayroll();
		await createDispatchedPayroll(fixture, {
			name: 'Large payroll',
			idempotencyKey: 'payroll_run_large_2026',
			amount: '100.000001'
		});
		const result = await fixture.t.run(async (ctx) => ({
			operation: (await ctx.db.query('operations').collect())[0],
			item: (await ctx.db.query('paymentBatchItems').collect())[0],
			attempt: (await ctx.db.query('providerAttempts').collect())[0]
		}));
		expect(result.operation.approvalPath).toBe('privyIntent');
		expect(result.attempt.providerKind).toBe('privyIntent');
		expect(result.item.routeReason).toContain('Privy quorum approval');
	});

	it('rejects duplicate members before creating a payroll run', async () => {
		const fixture = await setupPayroll();
		await expect(
			fixture.owner.mutation(api.payouts.saveDraft, {
				organizationId: fixture.organizationId,
				type: 'payroll',
				name: 'Duplicate payroll',
				sourceWalletId: fixture.walletId,
				idempotencyKey: 'payroll_run_duplicate',
				payPeriodStart: '2026-09-01',
				payPeriodEnd: '2026-09-30',
				payDate: '2026-09-30',
				denominationCurrency: 'USD',
				items: [
					{ userId: fixture.memberId, amount: '1' },
					{ userId: fixture.memberId, amount: '2' }
				]
			})
		).rejects.toThrow('cannot include a member twice');
		const batches = await fixture.t.run((ctx) => ctx.db.query('paymentBatches').collect());
		expect(batches).toHaveLength(0);
	});

	it('will not retry an ambiguous payout item', async () => {
		const fixture = await setupPayroll();
		const created = await createDispatchedPayroll(fixture, {
			name: 'Ambiguous payroll',
			idempotencyKey: 'payroll_run_ambiguous',
			amount: '80'
		});
		const itemId = await fixture.t.run(async (ctx) => {
			const item = await ctx.db
				.query('paymentBatchItems')
				.withIndex('by_batch', (q) => q.eq('batchId', created.batchId))
				.unique();
			if (!item?.operationId) throw new Error('Expected a payout operation.');
			const attempt = await ctx.db
				.query('providerAttempts')
				.withIndex('by_operation', (q) => q.eq('operationId', item.operationId!))
				.unique();
			if (!attempt) throw new Error('Expected a provider attempt.');
			await ctx.db.patch(item._id, { status: 'failed' });
			await ctx.db.patch(item.operationId, {
				status: 'failed',
				errorCode: 'provider_result_ambiguous'
			});
			await ctx.db.patch(attempt._id, { status: 'ambiguous' });
			return item._id;
		});
		await expect(
			fixture.owner.mutation(api.payouts.retryItem, {
				organizationId: fixture.organizationId,
				itemId,
				idempotencyKey: 'retry_ambiguous_01'
			})
		).rejects.toThrow('Reconcile the ambiguous provider attempt');
	});

	it('rechecks current Privy policy authority before a definitive retry', async () => {
		const fixture = await setupPayroll();
		const created = await createDispatchedPayroll(fixture, {
			name: 'Retry payroll',
			idempotencyKey: 'payroll_run_retry_policy',
			amount: '80'
		});
		const itemId = await fixture.t.run(async (ctx) => {
			const item = await ctx.db
				.query('paymentBatchItems')
				.withIndex('by_batch', (q) => q.eq('batchId', created.batchId))
				.unique();
			if (!item?.operationId) throw new Error('Expected a payout operation.');
			const attempt = await ctx.db
				.query('providerAttempts')
				.withIndex('by_operation', (q) => q.eq('operationId', item.operationId!))
				.unique();
			const policy = await ctx.db.query('policies').unique();
			if (!attempt || !policy) throw new Error('Expected payout policy and attempt.');
			await ctx.db.patch(item._id, { status: 'failed' });
			await ctx.db.patch(item.operationId, { status: 'failed' });
			await ctx.db.patch(attempt._id, { status: 'failed' });
			await ctx.db.patch(policy._id, { status: 'superseded' });
			return item._id;
		});
		const retried = await fixture.owner.mutation(api.payouts.retryItem, {
			organizationId: fixture.organizationId,
			itemId,
			idempotencyKey: 'retry_policy_changed_01'
		});
		const operation = await fixture.t.run((ctx) => ctx.db.get(retried.operationId));
		expect(operation?.approvalPath).toBe('privyIntent');
	});

	it('reclaims an expired pre-provider lease without creating another attempt', async () => {
		const fixture = await setupPayroll();
		await createDispatchedPayroll(fixture, {
			name: 'Recoverable payroll',
			idempotencyKey: 'recoverable_payroll_2026',
			amount: '80'
		});
		const staleClaimedAt = Date.now() - 6 * 60_000;
		const attemptId = await fixture.t.run(async (ctx) => {
			const attempt = await ctx.db.query('providerAttempts').unique();
			if (!attempt) throw new Error('Expected provider attempt.');
			await ctx.db.patch(attempt._id, {
				status: 'claimed',
				claimedAt: staleClaimedAt,
				updatedAt: staleClaimedAt
			});
			return attempt._id;
		});
		expect(
			await fixture.owner.mutation(internal.payoutAttemptState.claimAndSchedule, { attemptId })
		).toBe(true);
		const attempts = await fixture.t.run((ctx) => ctx.db.query('providerAttempts').collect());
		expect(attempts).toHaveLength(1);
		expect(attempts[0].status).toBe('claimed');
		expect(attempts[0].claimedAt).toBeGreaterThan(staleClaimedAt);
	});

	it('marks an expired provider-started lease ambiguous instead of replaying it', async () => {
		const fixture = await setupPayroll();
		const run = await createDispatchedPayroll(fixture, {
			name: 'Uncertain payroll',
			idempotencyKey: 'uncertain_payroll_2026',
			amount: '80'
		});
		const attemptId = await fixture.t.run(async (ctx) => {
			const attempt = await ctx.db.query('providerAttempts').unique();
			if (!attempt) throw new Error('Expected provider attempt.');
			const stale = Date.now() - 6 * 60_000;
			await ctx.db.patch(attempt._id, {
				status: 'claimed',
				claimedAt: stale,
				providerStartedAt: stale,
				updatedAt: stale
			});
			return attempt._id;
		});
		expect(
			await fixture.owner.mutation(internal.payoutAttemptState.claimAndSchedule, { attemptId })
		).toBe(false);
		await fixture.owner.mutation(internal.payoutAttemptState.markFailed, {
			attemptId,
			errorCode: 'late_worker_failure'
		});
		const stored = await fixture.t.run(async (ctx) => ({
			attempt: await ctx.db.get(attemptId),
			batch: await ctx.db.get(run.batchId),
			item: await ctx.db.query('paymentBatchItems').unique()
		}));
		expect(stored.attempt?.status).toBe('ambiguous');
		expect(stored.item?.status).toBe('ambiguous');
		expect(stored.batch?.status).toBe('needsAttention');
	});
});
