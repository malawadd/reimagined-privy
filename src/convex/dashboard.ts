import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireMembership } from './lib/authz';
import { operationDocumentValidator } from './lib/validators';

export const get = query({
	args: { organizationId: v.id('organizations') },
	returns: v.object({
		walletCount: v.number(),
		policyCount: v.number(),
		memberCount: v.number(),
		activeAutomationCount: v.number(),
		pendingApprovalCount: v.number(),
		quorum: v.union(
			v.null(),
			v.object({ threshold: v.number(), reviewerCount: v.number(), mfaRequired: v.boolean() })
		),
		recentOperations: v.array(operationDocumentValidator)
	}),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		const [wallets, policies, memberships, automations, operations, reviewers] = await Promise.all([
			ctx.db
				.query('wallets')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100),
			ctx.db
				.query('policies')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100),
			ctx.db
				.query('memberships')
				.withIndex('by_org_user', (q) => q.eq('organizationId', args.organizationId))
				.take(100),
			ctx.db
				.query('automations')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100),
			ctx.db
				.query('operations')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(20),
			ctx.db
				.query('reviewerMembers')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(500)
		]);
		const primaryWallet = wallets[0];
		const activeReviewers = primaryWallet
			? reviewers.filter(
					(reviewer) => reviewer.walletId === primaryWallet._id && reviewer.status === 'active'
				)
			: [];

		return {
			walletCount: wallets.length,
			policyCount: policies.filter((policy) => policy.status === 'active').length,
			memberCount: memberships.filter((membership) => membership.status === 'active').length,
			activeAutomationCount: automations.filter((automation) => automation.status === 'active')
				.length,
			pendingApprovalCount: operations.filter((operation) => operation.status === 'pendingApproval')
				.length,
			quorum: primaryWallet
				? {
						threshold: primaryWallet.approvalThreshold ?? 1,
						reviewerCount: activeReviewers.length,
						mfaRequired: activeReviewers.length > 0
					}
				: null,
			recentOperations: operations
		};
	}
});
