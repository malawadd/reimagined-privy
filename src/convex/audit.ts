import { v } from 'convex/values';
import { query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { requireMembership } from './lib/authz';

export const listPaginated = query({
	args: { organizationId: v.id('organizations'), paginationOpts: paginationOptsValidator },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'audit:read');
		return ctx.db
			.query('auditEvents')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.paginate(args.paginationOpts);
	}
});
