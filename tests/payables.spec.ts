import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');

describe('payable approval and execution', () => {
	it('requires a separate wallet approver before creating a Privy provider attempt', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({
			subject: 'did:privy:payable-owner',
			email: 'owner@example.com'
		});
		const reviewer = t.withIdentity({
			subject: 'did:privy:payable-reviewer',
			email: 'reviewer@example.com'
		});
		const ownerId = await owner.mutation(api.users.syncCurrent, {});
		const reviewerId = await reviewer.mutation(api.users.syncCurrent, {});
		const { organizationId, walletId, recipientId } = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Payable Co',
				slug: `payable-${crypto.randomUUID()}`,
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
				userId: reviewerId,
				role: 'approver',
				status: 'active'
			});
			const walletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_payables',
				name: 'Payables treasury',
				address: '0x0000000000000000000000000000000000000001',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_payables',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'treasury'
			});
			await ctx.db.insert('walletAssignments', {
				organizationId,
				walletId,
				userId: reviewerId,
				permissions: ['view', 'approve'],
				status: 'active',
				updatedAt: Date.now()
			});
			const recipientId = await ctx.db.insert('recipients', {
				organizationId,
				label: 'Approved vendor',
				address: '0x0000000000000000000000000000000000000002',
				assets: ['USDC'],
				status: 'approved',
				createdBy: reviewerId,
				approvedBy: ownerId,
				approvedAt: Date.now()
			});
			return { organizationId, walletId, recipientId };
		});

		const payableId = await owner.mutation(api.payables.create, {
			organizationId,
			type: 'bill',
			reference: 'BILL-1001',
			payeeName: 'Approved vendor',
			recipientId,
			destination: '0x0000000000000000000000000000000000000002',
			amount: '12.5',
			dueAt: Date.now() + 86_400_000
		});
		await owner.mutation(api.payables.submitForApproval, {
			organizationId,
			payableId,
			walletId
		});
		await expect(
			owner.mutation(api.payables.approve, { organizationId, payableId })
		).rejects.toThrow('creator cannot approve');
		await reviewer.mutation(api.payables.approve, { organizationId, payableId });
		const queued = await owner.mutation(api.payables.queuePayment, {
			organizationId,
			payableId,
			walletId
		});
		const stored = await t.run(async (ctx) => ({
			payable: await ctx.db.get(payableId),
			operation: await ctx.db.get(queued.operationId),
			attempt: await ctx.db.query('providerAttempts').unique(),
			journals: await ctx.db.query('journals').collect()
		}));
		expect(stored.payable?.status).toBe('paymentQueued');
		expect(stored.operation?.approvalPath).toBe('privyIntent');
		expect(stored.attempt?.status).toBe('pending');
		expect(stored.journals.some((journal) => journal.sourceKey.includes(String(payableId)))).toBe(
			true
		);
	});
});
