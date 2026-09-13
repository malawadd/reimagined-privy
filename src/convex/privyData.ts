import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import { operationDocumentValidator, walletDocumentValidator } from './lib/validators';

export const getOperationBundle = internalQuery({
	args: { operationId: v.id('operations') },
	returns: v.object({
		operation: operationDocumentValidator,
		principal: v.any(),
		wallet: v.union(v.null(), walletDocumentValidator),
		intent: v.any(),
		walletAction: v.any()
	}),
	handler: async (ctx, args) => {
		const operation = await ctx.db.get(args.operationId);
		if (!operation) throw new Error('Operation not found.');
		const principal = operation.automationRunId
			? null
			: await ctx.db
					.query('servicePrincipals')
					.withIndex('by_org_status', (q) =>
						q.eq('organizationId', operation.organizationId).eq('status', 'active')
					)
					.first();
		const wallet = operation.sourceWalletId
			? await ctx.db.get(operation.sourceWalletId)
			: await ctx.db
					.query('wallets')
					.withIndex('by_org', (q) => q.eq('organizationId', operation.organizationId))
					.first();
		if (wallet && wallet.organizationId !== operation.organizationId)
			throw new Error('Operation source wallet is invalid.');
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
	returns: v.object({
		run: v.any(),
		automation: v.any(),
		principal: v.any(),
		wallet: walletDocumentValidator
	}),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) throw new Error('Run not found.');
		const automation = await ctx.db.get(run.automationId);
		if (!automation) throw new Error('Automation not found.');
		if (automation.organizationId !== run.organizationId)
			throw new Error('Automation organization mismatch.');
		const principal = await ctx.db.get(automation.servicePrincipalId);
		const wallet = automation.sourceWalletId
			? await ctx.db.get(automation.sourceWalletId)
			: await ctx.db
					.query('wallets')
					.withIndex('by_org', (q) => q.eq('organizationId', automation.organizationId))
					.first();
		if (!principal || !wallet) throw new Error('Automation dependencies are missing.');
		if (principal.organizationId !== run.organizationId || principal.status !== 'active')
			throw new Error('Automation service principal is invalid or revoked.');
		if (wallet.organizationId !== run.organizationId)
			throw new Error('Automation source wallet is outside the organization.');
		return { run, automation, principal, wallet };
	}
});
export const getWallet = internalQuery({
	args: { walletId: v.id('wallets') },
	returns: v.union(v.null(), walletDocumentValidator),
	handler: (ctx, args) => ctx.db.get(args.walletId)
});
export const listPending = internalQuery({
	args: {},
	returns: v.object({
		operations: v.array(operationDocumentValidator),
		staleRuns: v.array(v.any())
	}),
	handler: async (ctx) => ({
		operations: (
			await Promise.all(
				(['pendingApproval', 'executing', 'pendingConfirmation'] as const).map((status) =>
					ctx.db
						.query('operations')
						.withIndex('by_status', (q) => q.eq('status', status))
						.order('desc')
						.take(100)
				)
			)
		).flat(),
		staleRuns: await ctx.db
			.query('automationRuns')
			.withIndex('by_status', (q) =>
				q.eq('status', 'ambiguous').lt('updatedAt', Date.now() - 300_000)
			)
			.take(100)
	})
});
