import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { normalizeDecimal, normalizeEvmAddress, selectPaymentRoute } from '../lib/domain';
import { internal } from './_generated/api';
import { appendAudit } from './lib/audit';

export const createPayment = mutation({
	args: {
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		amount: v.string(),
		destination: v.string(),
		memo: v.optional(v.string()),
		reference: v.string()
	},
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'payment:create');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		const destination = normalizeEvmAddress(args.destination);
		const amount = normalizeDecimal(args.amount, args.asset === 'USDC' ? 6 : 18);
		const recipient = await ctx.db
			.query('recipients')
			.filter((q) =>
				q.and(
					q.eq(q.field('organizationId'), args.organizationId),
					q.eq(q.field('address'), destination)
				)
			)
			.first();
		const decision = selectPaymentRoute({
			asset: args.asset,
			amount,
			destination,
			recipientApproved: recipient?.status === 'approved' && recipient.assets.includes(args.asset)
		});
		if (decision.path === 'blocked') throw new Error('policy_change_required');
		const now = Date.now();
		const correlationId = `payment:${args.organizationId}:${crypto.randomUUID()}`;
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'payment',
			status: 'queued',
			approvalPath: decision.path,
			asset: args.asset,
			amount,
			destination,
			memo: args.memo,
			reference: args.reference,
			createdBy: user._id,
			correlationId,
			createdAt: now,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: String(user.privyDid),
			action: 'payment.created',
			resourceType: 'operation',
			resourceId: operationId,
			correlationId,
			metadata: { asset: args.asset, amount, destination, approvalPath: decision.path }
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.executePayment, {
			operationId,
			privyWalletId: wallet.privyWalletId
		});
		return { operationId, decision };
	}
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('operations')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.collect();
	}
});
export const get = query({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const operation = await ctx.db.get(args.operationId);
		assertOrgScoped(operation, args.organizationId);
		return operation;
	}
});
export const cancelDraft = mutation({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payment:create');
		const operation = await ctx.db.get(args.operationId);
		assertOrgScoped(operation, args.organizationId);
		if (operation.status !== 'draft' && operation.status !== 'queued')
			throw new Error('Operation can no longer be cancelled.');
		await ctx.db.patch(args.operationId, { status: 'cancelled', updatedAt: Date.now() });
	}
});
export const reconcile = mutation({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const operation = await ctx.db.get(args.operationId);
		assertOrgScoped(operation, args.organizationId);
		await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
			operationId: args.operationId
		});
	}
});
