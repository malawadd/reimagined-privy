import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireMembership } from './lib/authz';

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({
			operationId: v.id('operations'),
			reference: v.string(),
			asset: v.optional(v.union(v.literal('ETH'), v.literal('USDC'))),
			amount: v.optional(v.string()),
			destination: v.optional(v.string()),
			createdAt: v.number(),
			createdByName: v.string(),
			intentId: v.union(v.null(), v.string()),
			intentType: v.union(v.null(), v.string()),
			approvals: v.number(),
			threshold: v.number(),
			expiresAt: v.union(v.null(), v.number())
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'approval:read');
		const operations = await ctx.db
			.query('operations')
			.withIndex('by_org_status', (q) =>
				q.eq('organizationId', args.organizationId).eq('status', 'pendingApproval')
			)
			.order('desc')
			.take(250);
		return Promise.all(
			operations.map(async (operation) => {
				const [intent, creator] = await Promise.all([
					ctx.db
						.query('intentSnapshots')
						.withIndex('by_operation', (q) => q.eq('operationId', operation._id))
						.order('desc')
						.first(),
					operation.createdBy ? ctx.db.get(operation.createdBy) : null
				]);
				return {
					operationId: operation._id,
					reference: operation.reference,
					asset: operation.asset,
					amount: operation.amount,
					destination: operation.destination,
					createdAt: operation.createdAt,
					createdByName: creator?.name ?? creator?.email ?? 'System',
					intentId: intent?.privyIntentId ?? null,
					intentType: intent?.type ?? null,
					approvals: intent?.approvals ?? 0,
					threshold: intent?.threshold ?? 0,
					expiresAt: intent?.expiresAt ?? null
				};
			})
		);
	}
});
