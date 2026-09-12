import { v } from 'convex/values';
import { query } from './_generated/server';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { requireMembership } from './lib/authz';
import { auditEventDocumentValidator } from './lib/validators';

export const listRecent = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(auditEventDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'audit:read');
		return ctx.db
			.query('auditEvents')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(250);
	}
});

export const listPaginated = query({
	args: { organizationId: v.id('organizations'), paginationOpts: paginationOptsValidator },
	returns: paginationResultValidator(auditEventDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'audit:read');
		return ctx.db
			.query('auditEvents')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.paginate(args.paginationOpts);
	}
});
