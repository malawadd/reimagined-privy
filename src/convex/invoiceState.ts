import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { appendAudit } from './lib/audit';
import { postSourceJournal, prepareSourceJournalReversal } from './lib/accounting';

export const attachCollectionWallet = internalMutation({
	args: {
		invoiceId: v.id('invoices'),
		walletId: v.id('wallets'),
		servicePrincipalId: v.id('servicePrincipals'),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		treasuryDestination: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice) throw new Error('Invoice not found.');
		if (invoice.status === 'void') return null;
		if (invoice.collectionWalletId && invoice.collectionWalletId !== args.walletId)
			throw new Error('Invoice already has a different collection wallet.');
		await ctx.db.patch(invoice._id, {
			collectionWalletId: args.walletId,
			status: 'issued',
			updatedAt: Date.now()
		});
		await postSourceJournal(ctx, {
			organizationId: invoice.organizationId,
			sourceKey: `invoice:${invoice._id}:issued`,
			sourceType: 'invoice',
			amount: invoice.amount,
			asset: invoice.asset,
			postingDate: Date.now(),
			description: `Invoice ${invoice.invoiceNumber} issued`
		});
		const existingAutomation = await ctx.db
			.query('automations')
			.withIndex('by_source_wallet', (q) => q.eq('sourceWalletId', args.walletId))
			.first();
		if (!existingAutomation)
			await ctx.db.insert('automations', {
				organizationId: invoice.organizationId,
				name: `Sweep ${invoice.invoiceNumber} collections`,
				type: 'depositSweep',
				status: 'active',
				servicePrincipalId: args.servicePrincipalId,
				sourceWalletId: args.walletId,
				destination: args.treasuryDestination,
				asset: args.asset,
				policySummary: `Base Sepolia ${args.asset} to the configured treasury destination only`,
				createdBy: invoice.createdBy
			});
		await appendAudit(ctx, {
			organizationId: invoice.organizationId,
			actorType: 'system',
			actorId: 'convex',
			action: 'invoice.issued',
			resourceType: 'invoice',
			resourceId: invoice._id,
			correlationId: `invoice:${invoice._id}`,
			metadata: { walletId: args.walletId }
		});
		return null;
	}
});

export const markProvisioningFailed = internalMutation({
	args: { invoiceId: v.id('invoices'), reason: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const invoice = await ctx.db.get(args.invoiceId);
		if (!invoice || invoice.status !== 'provisioning') return null;
		const reversalJournalId = await prepareSourceJournalReversal(ctx, {
			organizationId: invoice.organizationId,
			sourceKey: `invoice:${invoice._id}:issued`,
			reason: `Invoice ${invoice.invoiceNumber} provisioning failed`,
			preparedBy: invoice.createdBy
		});
		await ctx.db.patch(invoice._id, { status: 'failed', updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: invoice.organizationId,
			actorType: 'system',
			actorId: 'convex',
			action: 'invoice.provisioning_failed',
			resourceType: 'invoice',
			resourceId: invoice._id,
			correlationId: `invoice:${invoice._id}`,
			metadata: reversalJournalId
				? { reason: args.reason, reversalJournalId }
				: { reason: args.reason }
		});
		return null;
	}
});

export const markOverdue = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const now = Date.now();
		const [issued, partiallyPaid] = await Promise.all([
			ctx.db
				.query('invoices')
				.withIndex('by_status_due', (q) => q.eq('status', 'issued').lt('dueAt', now))
				.take(100),
			ctx.db
				.query('invoices')
				.withIndex('by_status_due', (q) => q.eq('status', 'partiallyPaid').lt('dueAt', now))
				.take(100)
		]);
		for (const invoice of [...issued, ...partiallyPaid])
			await ctx.db.patch(invoice._id, { status: 'overdue', updatedAt: now });
		return issued.length + partiallyPaid.length;
	}
});
