import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireIdentity, requireMembership } from './lib/authz';
import { membershipDocumentValidator, organizationDocumentValidator } from './lib/validators';
import { appendAudit } from './lib/audit';
import { internal } from './_generated/api';

export const createAndProvision = mutation({
	args: { name: v.string(), requestKey: v.string() },
	returns: v.object({
		organizationId: v.id('organizations'),
		provisioningRunId: v.id('provisioningRuns')
	}),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
		if (!user) throw new Error('Sync the current user first.');
		const name = args.name.trim();
		if (name.length < 2 || name.length > 100) throw new Error('Enter an organization name.');
		const requestKey = args.requestKey.trim();
		if (requestKey.length < 24 || requestKey.length > 120)
			throw new Error('Invalid provisioning request key.');
		const runKey = `organization:${identity.subject}:${requestKey}`;
		const existingRun = await ctx.db
			.query('provisioningRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (existingRun)
			return {
				organizationId: existingRun.organizationId,
				provisioningRunId: existingRun._id
			};
		const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
		const organizationId = await ctx.db.insert('organizations', {
			name,
			slug,
			createdByUserId: user._id,
			active: true,
			approvedAt: Date.now(),
			approvedByPrivyDid: identity.subject
		});
		await ctx.db.insert('memberships', {
			organizationId,
			userId: user._id,
			role: 'owner',
			status: 'active'
		});
		const provisioningRunId = await ctx.db.insert('provisioningRuns', {
			organizationId,
			requestedBy: user._id,
			runKey,
			kind: 'organization',
			walletName: `${name} Treasury`,
			purpose: 'treasury',
			status: 'pending',
			providerReferenceId: runKey,
			updatedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId,
			actorType: 'user',
			actorId: identity.subject,
			action: 'organization.created',
			resourceType: 'organization',
			resourceId: organizationId,
			correlationId: runKey,
			metadata: { network: 'eip155:84532' }
		});
		await ctx.scheduler.runAfter(0, internal.provisioningActions.execute, {
			provisioningRunId
		});
		return { organizationId, provisioningRunId };
	}
});

function slugify(value: string) {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'company'
	);
}

export const listMine = query({
	args: {},
	returns: v.array(
		v.object({
			organization: organizationDocumentValidator,
			membership: membershipDocumentValidator
		})
	),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
		if (!user) return [];

		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.take(100);
		const workspaces = await Promise.all(
			memberships
				.filter((membership) => membership.status === 'active')
				.map(async (membership) => ({
					membership,
					organization: await ctx.db.get(membership.organizationId)
				}))
		);
		return workspaces.flatMap(({ organization, membership }) =>
			organization?.active ? [{ organization, membership }] : []
		);
	}
});

export const getActive = query({
	args: { organizationId: v.id('organizations') },
	returns: v.union(v.null(), organizationDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db.get(args.organizationId);
	}
});
