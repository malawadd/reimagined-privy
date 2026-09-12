import { v } from 'convex/values';
import { internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { privyUserIdsEqual } from '../lib/wallet-controls';

export const check = internalQuery({
	args: { subject: v.string(), organizationId: v.id('organizations'), intentId: v.string() },
	returns: v.object({ allowed: v.boolean(), operationId: v.optional(v.id('operations')) }),
	handler: async (ctx, args) => {
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', args.subject))
			.unique();
		if (!user) return { allowed: false };
		const membership = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', user._id)
			)
			.unique();
		if (!membership || membership.status !== 'active') return { allowed: false };
		const snapshot = await ctx.db
			.query('intentSnapshots')
			.withIndex('by_privy_id', (q) => q.eq('privyIntentId', args.intentId))
			.order('desc')
			.first();
		if (!snapshot || snapshot.organizationId !== args.organizationId) return { allowed: false };
		const operation = await ctx.db.get(snapshot.operationId);
		if (
			!operation ||
			operation.organizationId !== args.organizationId ||
			operation.status !== 'pendingApproval'
		)
			return { allowed: false };
		if (!hasUnsignedUserMember(snapshot.raw, args.subject)) return { allowed: false };
		if (operation.sourceWalletId && membership.role !== 'owner') {
			const assignment = await ctx.db
				.query('walletAssignments')
				.withIndex('by_wallet_user', (q) =>
					q.eq('walletId', operation.sourceWalletId as Id<'wallets'>).eq('userId', user._id)
				)
				.unique();
			if (
				!assignment ||
				assignment.status !== 'active' ||
				!assignment.permissions.includes('approve')
			)
				return { allowed: false };
		}
		return { allowed: true, operationId: operation._id };
	}
});

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
