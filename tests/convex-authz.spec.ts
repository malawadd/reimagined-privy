import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api, internal } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');

describe('Convex tenant authorization', () => {
	it('denies a valid user who is not a member of the organization', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({ subject: 'did:privy:owner' });
		await owner.mutation(api.users.syncCurrent, { email: 'owner@example.com' });
		const organizationId = await owner.mutation(api.organizations.create, {
			name: 'Owner company',
			slug: 'owner-company'
		});

		const outsider = t.withIdentity({ subject: 'did:privy:outsider' });
		await outsider.mutation(api.users.syncCurrent, { email: 'outsider@example.com' });
		await expect(outsider.query(api.organizations.getActive, { organizationId })).rejects.toThrow(
			'Organization access denied'
		);
	});

	it('materializes one sweep operation when a deposit webhook is replayed', async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const userId = await ctx.db.insert('users', {
				privyDid: 'did:privy:owner',
				lastSeenAt: Date.now()
			});
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Sweep Co',
				slug: 'sweep-co',
				createdByUserId: userId,
				active: true
			});
			const principalId = await ctx.db.insert('servicePrincipals', {
				organizationId,
				name: 'Sweeper',
				purpose: 'Deposit collection',
				privyAuthorizationKeyId: 'key_test',
				status: 'active'
			});
			const walletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_source',
				name: 'Collection',
				address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_test',
				signerIds: ['key_test'],
				policyIds: ['policy_sweep'],
				syncVersion: 1,
				syncedAt: Date.now()
			});
			const automationId = await ctx.db.insert('automations', {
				organizationId,
				name: 'Sweep deposits',
				type: 'depositSweep',
				status: 'active',
				servicePrincipalId: principalId,
				sourceWalletId: walletId,
				destination: '0x0000000000000000000000000000000000000001',
				asset: 'USDC',
				policySummary: 'USDC to treasury only',
				createdBy: userId
			});
			const receiptId = await ctx.db.insert('webhookReceipts', {
				svixMessageId: 'msg_deposit_01',
				eventType: 'wallet.deposit.detected',
				payload: {
					data: { wallet_id: 'wallet_source', asset: 'USDC', amount: '12.500000' }
				},
				receivedAt: Date.now()
			});
			return { receiptId, automationId };
		});

		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		const runs = await t.run((ctx) => ctx.db.query('automationRuns').collect());
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			automationId: ids.automationId,
			amount: '12.5',
			sourceEventId: 'msg_deposit_01'
		});

		const first = await t.mutation(internal.automationMaterialize.createOperation, {
			runId: runs[0]._id
		});
		const replay = await t.mutation(internal.automationMaterialize.createOperation, {
			runId: runs[0]._id
		});
		expect(replay).toBe(first);
		const operations = await t.run((ctx) => ctx.db.query('operations').collect());
		expect(operations).toHaveLength(1);
	});
});
