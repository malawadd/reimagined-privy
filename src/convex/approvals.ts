import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireMembership } from './lib/authz';
import { privyUserIdsEqual } from '../lib/wallet-controls';

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const { identity, user, membership } = await requireMembership(
			ctx,
			args.organizationId,
			'approval:read'
		);
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
					expiresAt: intent?.expiresAt ?? null,
					requestDetails: intent
						? ((intent.raw as Record<string, unknown>).request_details ?? null)
						: null,
					currentResource: intent
						? ((intent.raw as Record<string, unknown>).current_resource_data ?? null)
						: null,
					authorizationDetails: intent
						? ((intent.raw as Record<string, unknown>).authorization_details ?? [])
						: [],
					canApprove: Boolean(
						intent &&
						hasUnsignedUserMember(intent.raw, identity.subject) &&
						(membership.role === 'owner' ||
							(await hasWalletApproval(ctx, operation.sourceWalletId, user._id)))
					)
				};
			})
		);
	}
});

export const refresh = mutation({
	args: { organizationId: v.id('organizations'), operationId: v.id('operations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'approval:read');
		const operation = await ctx.db.get(args.operationId);
		if (!operation || operation.organizationId !== args.organizationId)
			throw new Error('Approval not found.');
		await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
			operationId: operation._id
		});
		return null;
	}
});

async function hasWalletApproval(
	ctx: Parameters<typeof requireMembership>[0],
	walletId: import('./_generated/dataModel').Id<'wallets'> | undefined,
	userId: import('./_generated/dataModel').Id<'users'>
) {
	if (!walletId) return true;
	const assignment = await ctx.db
		.query('walletAssignments')
		.withIndex('by_wallet_user', (q) => q.eq('walletId', walletId).eq('userId', userId))
		.unique();
	return Boolean(assignment?.status === 'active' && assignment.permissions.includes('approve'));
}

function hasUnsignedUserMember(value: unknown, subject: string): boolean {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	if (
		record.type === 'user' &&
		typeof record.user_id === 'string' &&
		privyUserIdsEqual(record.user_id, subject)
	)
		return record.signed_at == null;
	return Object.values(record).some((child) =>
		Array.isArray(child)
			? child.some((entry) => hasUnsignedUserMember(entry, subject))
			: hasUnsignedUserMember(child, subject)
	);
}
