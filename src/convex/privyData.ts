import { v } from 'convex/values';
import { internalQuery } from './_generated/server';

export const getOperationBundle = internalQuery({
	args: { operationId: v.id('operations') },
	handler: async (ctx, args) => {
		const operation = await ctx.db.get(args.operationId);
		if (!operation) throw new Error('Operation not found.');
		const principal = operation.automationRunId
			? null
			: await ctx.db
					.query('servicePrincipals')
					.withIndex('by_org', (q) => q.eq('organizationId', operation.organizationId))
					.filter((q) => q.eq(q.field('status'), 'active'))
					.first();
		const wallet = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', operation.organizationId))
			.first();
		const intent = await ctx.db
			.query('intentSnapshots')
			.withIndex('by_operation', (q) => q.eq('operationId', operation._id))
			.first();
		const walletAction = await ctx.db
			.query('walletActionSnapshots')
			.withIndex('by_operation', (q) => q.eq('operationId', operation._id))
			.first();
		return { operation, principal, wallet, intent, walletAction };
	}
});
export const getAutomationBundle = internalQuery({
	args: { runId: v.id('automationRuns') },
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) throw new Error('Run not found.');
		const automation = await ctx.db.get(run.automationId);
		if (!automation) throw new Error('Automation not found.');
		const principal = await ctx.db.get(automation.servicePrincipalId);
		const wallet = automation.sourceWalletId
			? await ctx.db.get(automation.sourceWalletId)
			: await ctx.db
					.query('wallets')
					.withIndex('by_org', (q) => q.eq('organizationId', automation.organizationId))
					.first();
		if (!principal || !wallet) throw new Error('Automation dependencies are missing.');
		return { run, automation, principal, wallet };
	}
});
export const getWallet = internalQuery({
	args: { walletId: v.id('wallets') },
	handler: (ctx, args) => ctx.db.get(args.walletId)
});
export const listPending = internalQuery({
	args: {},
	handler: async (ctx) => ({
		operations: await ctx.db
			.query('operations')
			.filter((q) =>
				q.or(
					q.eq(q.field('status'), 'pendingApproval'),
					q.eq(q.field('status'), 'executing'),
					q.eq(q.field('status'), 'pendingConfirmation')
				)
			)
			.take(100),
		staleRuns: await ctx.db
			.query('automationRuns')
			.filter((q) =>
				q.and(
					q.eq(q.field('status'), 'ambiguous'),
					q.lt(q.field('updatedAt'), Date.now() - 300_000)
				)
			)
			.take(100)
	})
});
