import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped, requireWalletPermission } from './lib/authz';
import { normalizeDecimal, normalizeEvmAddress, selectPaymentRoute } from '../lib/domain';
import { internal } from './_generated/api';
import { appendAudit } from './lib/audit';
import { operationDocumentValidator } from './lib/validators';

export const createPayment = mutation({
	args: {
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		amount: v.string(),
		destination: v.string(),
		memo: v.optional(v.string()),
		reference: v.string(),
		idempotencyKey: v.string()
	},
	returns: v.object({
		operationId: v.id('operations'),
		decision: v.object({
			path: v.union(v.literal('automationSigner'), v.literal('privyIntent')),
			reason: v.string(),
			requiresPolicyChange: v.boolean()
		}),
		deduplicated: v.boolean()
	}),
	handler: async (ctx, args) => {
		const { user, wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.walletId,
			'initiate',
			'payment:create'
		);
		const destination = normalizeEvmAddress(args.destination);
		const amount = normalizeDecimal(args.amount, args.asset === 'USDC' ? 6 : 18);
		const reference = args.reference.trim();
		const memo = args.memo?.trim();
		const requestKey = args.idempotencyKey.trim();
		if (!reference || reference.length > 80)
			throw new Error('Reference must be 1 to 80 characters.');
		if (memo && memo.length > 140) throw new Error('Memo must be 140 characters or fewer.');
		if (!/^[A-Za-z0-9:_-]{12,100}$/.test(requestKey))
			throw new Error('Invalid payment request key.');
		const recipient = await ctx.db
			.query('recipients')
			.withIndex('by_org_address', (q) =>
				q.eq('organizationId', args.organizationId).eq('address', destination)
			)
			.unique();
		const decision = selectPaymentRoute({
			asset: args.asset,
			amount,
			destination,
			recipientApproved: recipient?.status === 'approved' && recipient.assets.includes(args.asset)
		});
		if (decision.path === 'blocked') throw new Error('policy_change_required');
		const approvedDecision = {
			...decision,
			path: decision.path as 'automationSigner' | 'privyIntent'
		};
		const existing = await ctx.db
			.query('operations')
			.withIndex('by_org_request', (q) =>
				q.eq('organizationId', args.organizationId).eq('requestKey', requestKey)
			)
			.unique();
		if (existing)
			return { operationId: existing._id, decision: approvedDecision, deduplicated: true };
		const now = Date.now();
		const correlationId = `payment:${args.organizationId}:${requestKey}`;
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'payment',
			status: 'queued',
			approvalPath: decision.path,
			asset: args.asset,
			amount,
			destination,
			memo,
			reference,
			requestKey,
			createdBy: user._id,
			sourceWalletId: wallet._id,
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
			operationId
		});
		return { operationId, decision: approvedDecision, deduplicated: false };
	}
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(operationDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('operations')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(250);
	}
});
export const get = query({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	returns: operationDocumentValidator,
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const operation = await ctx.db.get(args.operationId);
		assertOrgScoped(operation, args.organizationId);
		return operation;
	}
});
export const cancelDraft = mutation({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payment:create');
		const operation = await ctx.db.get(args.operationId);
		assertOrgScoped(operation, args.organizationId);
		if (operation.status !== 'draft')
			throw new Error('Only an undispatched draft can be cancelled.');
		await ctx.db.patch(args.operationId, { status: 'cancelled', updatedAt: Date.now() });
		return null;
	}
});
export const reconcile = mutation({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const operation = await ctx.db.get(args.operationId);
		assertOrgScoped(operation, args.organizationId);
		await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
			operationId: args.operationId
		});
		return null;
	}
});
