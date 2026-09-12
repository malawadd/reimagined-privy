import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership } from './lib/authz';
import { postBalancedEntry, postOperationEntry } from './lib/ledger';

const ledgerEntryValidator = v.object({
	_id: v.id('ledgerEntries'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	sourceKey: v.string(),
	sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
	sourceId: v.string(),
	account: v.string(),
	direction: v.union(v.literal('debit'), v.literal('credit')),
	asset: v.union(v.literal('ETH'), v.literal('USDC')),
	amount: v.string(),
	transactionHash: v.optional(v.string()),
	occurredAt: v.number(),
	createdAt: v.number()
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(ledgerEntryValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		return ctx.db
			.query('ledgerEntries')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(500);
	}
});

export const reconciliationSummary = query({
	args: { organizationId: v.id('organizations') },
	returns: v.object({
		succeededOperations: v.number(),
		invoicePayments: v.number(),
		postedSources: v.number(),
		missingOperationIds: v.array(v.id('operations')),
		missingInvoicePaymentIds: v.array(v.id('invoicePayments')),
		ambiguousRuns: v.number()
	}),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		const [operations, invoicePayments, entries, ambiguousRuns] = await Promise.all([
			ctx.db
				.query('operations')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(250),
			ctx.db
				.query('invoicePayments')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(250),
			ctx.db
				.query('ledgerEntries')
				.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(500),
			ctx.db
				.query('automationRuns')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', args.organizationId).eq('status', 'ambiguous')
				)
				.take(100)
		]);
		const succeeded = operations.filter(
			(operation) => operation.status === 'succeeded' && operation.asset && operation.amount
		);
		const sourceKeys = new Set(entries.map((entry) => entry.sourceKey));
		return {
			succeededOperations: succeeded.length,
			invoicePayments: invoicePayments.length,
			postedSources: sourceKeys.size,
			missingOperationIds: succeeded
				.filter((operation) => !sourceKeys.has(`operation:${operation._id}`))
				.map((operation) => operation._id),
			missingInvoicePaymentIds: invoicePayments
				.filter((payment) => !sourceKeys.has(`invoicePayment:${payment._id}`))
				.map((payment) => payment._id),
			ambiguousRuns: ambiguousRuns.length
		};
	}
});

export const rebuildMissing = mutation({
	args: { organizationId: v.id('organizations') },
	returns: v.number(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'reconciliation:manage');
		const [operations, invoicePayments] = await Promise.all([
			ctx.db
				.query('operations')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(250),
			ctx.db
				.query('invoicePayments')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(250)
		]);
		let posted = 0;
		for (const operation of operations) {
			if (operation.status !== 'succeeded' || !operation.asset || !operation.amount) continue;
			await postOperationEntry(ctx, operation);
			posted += 1;
		}
		for (const payment of invoicePayments) {
			await postBalancedEntry(ctx, {
				organizationId: payment.organizationId,
				sourceKey: `invoicePayment:${payment._id}`,
				sourceType: 'invoicePayment',
				sourceId: payment._id,
				debitAccount: `Wallet:collection:${payment.walletId}`,
				creditAccount: 'Accounts receivable',
				asset: 'USDC',
				amount: payment.amount,
				transactionHash: payment.transactionHash,
				occurredAt: payment.receivedAt
			});
			posted += 1;
		}
		return posted;
	}
});
