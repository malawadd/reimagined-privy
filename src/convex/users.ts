import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireIdentity } from './lib/authz';
import { userDocumentValidator } from './lib/validators';

export const getCurrent = query({
	args: {},
	returns: v.union(v.null(), userDocumentValidator),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		return ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
	}
});

export const syncCurrent = mutation({
	args: { email: v.optional(v.string()), name: v.optional(v.string()) },
	returns: v.id('users'),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const existing = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, { ...args, lastSeenAt: Date.now() });
			return existing._id;
		}
		return ctx.db.insert('users', { privyDid: identity.subject, ...args, lastSeenAt: Date.now() });
	}
});
