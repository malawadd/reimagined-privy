import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api, internal } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');

describe('invoice accounting lifecycle', () => {
	it('posts issuance only after provisioning and prepares a reviewed void reversal', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({
			subject: 'did:privy:invoice-owner',
			email: 'owner@example.com'
		});
		const reviewer = t.withIdentity({
			subject: 'did:privy:invoice-reviewer',
			email: 'reviewer@example.com'
		});
		const ownerId = await owner.mutation(api.users.syncCurrent, {});
		const reviewerId = await reviewer.mutation(api.users.syncCurrent, {});
		const seeded = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Invoice Accounting',
				slug: `invoice-accounting-${crypto.randomUUID()}`,
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
			const servicePrincipalId = await ctx.db.insert('servicePrincipals', {
				organizationId,
				name: 'Invoice sweep signer',
				purpose: 'Test invoice collection sweep',
				privyAuthorizationKeyId: 'key_invoice_test',
				status: 'active'
			});
			const treasuryWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_invoice_treasury',
				name: 'Treasury',
				address: '0x0000000000000000000000000000000000000001',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_invoice',
				signerIds: ['key_invoice_test'],
				policyIds: ['policy_invoice'],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'treasury'
			});
			const collectionWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_invoice_collection',
				name: 'Invoice collection',
				address: '0x0000000000000000000000000000000000000002',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_invoice',
				signerIds: ['key_invoice_test'],
				policyIds: ['policy_invoice'],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'collection'
			});
			const now = Date.now();
			const invoiceId = await ctx.db.insert('invoices', {
				organizationId,
				invoiceNumber: 'INV-VOID-1',
				customerName: 'Test customer',
				asset: 'USDC',
				amount: '40',
				paidAmount: '0',
				dueAt: now + 86_400_000,
				status: 'provisioning',
				lineItems: [{ description: 'Service', quantity: '1', unitAmount: '40' }],
				treasuryWalletId,
				publicTokenHash: 'a'.repeat(64),
				publicTokenCreatedAt: now,
				createdBy: ownerId,
				createdAt: now,
				updatedAt: now
			});
			return { organizationId, invoiceId, servicePrincipalId, collectionWalletId };
		});

		expect(await t.run((ctx) => ctx.db.query('journals').collect())).toHaveLength(0);
		await t.mutation(internal.invoiceState.attachCollectionWallet, {
			invoiceId: seeded.invoiceId,
			walletId: seeded.collectionWalletId,
			servicePrincipalId: seeded.servicePrincipalId,
			treasuryDestination: '0x0000000000000000000000000000000000000001'
		});
		const issued = await t.run((ctx) => ctx.db.query('journals').unique());
		expect(issued).toMatchObject({
			sourceKey: `invoice:${seeded.invoiceId}:issued`,
			sourceType: 'invoice',
			status: 'posted'
		});

		await owner.mutation(api.invoices.voidInvoice, {
			organizationId: seeded.organizationId,
			invoiceId: seeded.invoiceId
		});
		const reversal = await t.run((ctx) =>
			ctx.db
				.query('journals')
				.withIndex('by_source', (q) =>
					q
						.eq('organizationId', seeded.organizationId)
						.eq('sourceKey', `invoice:${seeded.invoiceId}:issued:reversal`)
						.eq('version', 1)
				)
				.unique()
		);
		expect(reversal).toMatchObject({ status: 'draft', reversalOf: issued?._id });
		if (!reversal) throw new Error('Expected a prepared reversal.');
		await reviewer.mutation(api.accounting.postManualJournal, {
			organizationId: seeded.organizationId,
			journalId: reversal._id
		});
		const trialBalance = await reviewer.query(api.accounting.trialBalance, {
			organizationId: seeded.organizationId,
			through: Date.now()
		});
		const receivable = trialBalance.rows.find((row: { code: string }) => row.code === '1100');
		expect(receivable).toMatchObject({ debit: '40', credit: '40' });
	}, 15_000);
});
