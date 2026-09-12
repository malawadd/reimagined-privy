import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireMembership } from './lib/authz';
import { decimalToUnits, unitsToDecimal } from '../lib/domain';

const assetTotals = v.object({
	asset: v.union(v.literal('ETH'), v.literal('USDC')),
	amount: v.string()
});

export const financeSummary = query({
	args: { organizationId: v.id('organizations'), from: v.number(), to: v.number() },
	returns: v.object({
		from: v.number(),
		to: v.number(),
		inflows: v.array(assetTotals),
		outflows: v.array(assetTotals),
		outstandingReceivablesUsdc: v.string(),
		openPayablesUsdc: v.string(),
		operationCount: v.number(),
		succeededCount: v.number(),
		pendingCount: v.number(),
		failedCount: v.number()
	}),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		if (!Number.isFinite(args.from) || !Number.isFinite(args.to) || args.from >= args.to)
			throw new Error('Invalid report period.');
		if (args.to - args.from > 366 * 86_400_000)
			throw new Error('Report periods are limited to 366 days.');

		const [entries, operations, invoices, payables] = await Promise.all([
			ctx.db
				.query('ledgerEntries')
				.withIndex('by_org_time', (q) =>
					q
						.eq('organizationId', args.organizationId)
						.gte('occurredAt', args.from)
						.lte('occurredAt', args.to)
				)
				.take(1_000),
			ctx.db
				.query('operations')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(500),
			ctx.db
				.query('invoices')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(500),
			ctx.db
				.query('payables')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(500)
		]);

		const movement = {
			ETH: { inflow: 0n, outflow: 0n },
			USDC: { inflow: 0n, outflow: 0n }
		};
		for (const entry of entries) {
			if (!entry.account.startsWith('Wallet:')) continue;
			const units = decimalToUnits(entry.amount, entry.asset === 'USDC' ? 6 : 18);
			movement[entry.asset][entry.direction === 'debit' ? 'inflow' : 'outflow'] += units;
		}

		let receivables = 0n;
		for (const invoice of invoices) {
			if (invoice.status === 'void' || invoice.status === 'failed') continue;
			const remaining = decimalToUnits(invoice.amount, 6) - decimalToUnits(invoice.paidAmount, 6);
			if (remaining > 0n) receivables += remaining;
		}
		let openPayables = 0n;
		for (const payable of payables)
			if (payable.status === 'draft' || payable.status === 'paymentQueued')
				openPayables += decimalToUnits(payable.amount, 6);

		const periodOperations = operations.filter(
			(operation) => operation.createdAt >= args.from && operation.createdAt <= args.to
		);
		return {
			from: args.from,
			to: args.to,
			inflows: [
				{ asset: 'ETH' as const, amount: unitsToDecimal(movement.ETH.inflow.toString(), 18) },
				{ asset: 'USDC' as const, amount: unitsToDecimal(movement.USDC.inflow.toString(), 6) }
			],
			outflows: [
				{ asset: 'ETH' as const, amount: unitsToDecimal(movement.ETH.outflow.toString(), 18) },
				{ asset: 'USDC' as const, amount: unitsToDecimal(movement.USDC.outflow.toString(), 6) }
			],
			outstandingReceivablesUsdc: unitsToDecimal(receivables.toString(), 6),
			openPayablesUsdc: unitsToDecimal(openPayables.toString(), 6),
			operationCount: periodOperations.length,
			succeededCount: periodOperations.filter((operation) => operation.status === 'succeeded')
				.length,
			pendingCount: periodOperations.filter((operation) =>
				['queued', 'pendingApproval', 'executing', 'pendingConfirmation'].includes(operation.status)
			).length,
			failedCount: periodOperations.filter((operation) =>
				['failed', 'rejected', 'expired', 'cancelled'].includes(operation.status)
			).length
		};
	}
});
