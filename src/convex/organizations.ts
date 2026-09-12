import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireIdentity, requireMembership } from './lib/authz';

export const create = mutation({
	args: { name: v.string(), slug: v.string() },
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
		if (!user) throw new Error('Sync the current user first.');
		if (
			await ctx.db
				.query('organizations')
				.withIndex('by_slug', (q) => q.eq('slug', args.slug))
				.unique()
		)
			throw new Error('Organization slug already exists.');
		const organizationId = await ctx.db.insert('organizations', {
			...args,
			createdByUserId: user._id,
			active: true
		});
		await ctx.db.insert('memberships', {
			organizationId,
			userId: user._id,
			role: 'owner',
			status: 'active'
		});
		return organizationId;
	}
});

export const getActive = query({
	args: { organizationId: v.id('organizations') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db.get(args.organizationId);
	}
});
