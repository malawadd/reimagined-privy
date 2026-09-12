import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireIdentity, requireMembership, requirePlatformOperator } from './lib/authz';
import { membershipDocumentValidator, organizationDocumentValidator } from './lib/validators';
import { appendAudit } from './lib/audit';

export const requestPilotAccess = mutation({
	args: { companyName: v.string(), contactEmail: v.string(), useCase: v.string() },
	returns: v.id('organizations'),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
		if (!user) throw new Error('Sync the current user first.');
		const existingMemberships = await ctx.db
			.query('memberships')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.take(100);
		const existingOrganizations = await Promise.all(
			existingMemberships.map((membership) => ctx.db.get(membership.organizationId))
		);
		if (existingOrganizations.some((organization) => organization && !organization.active))
			throw new Error('A pilot access request is already pending.');
		const companyName = args.companyName.trim();
		const useCase = args.useCase.trim();
		const contactEmail = args.contactEmail.trim().toLowerCase();
		if (companyName.length < 2 || companyName.length > 100)
			throw new Error('Enter a valid company name.');
		if (useCase.length < 20 || useCase.length > 1_000)
			throw new Error('Describe the operating use case in 20 to 1,000 characters.');
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))
			throw new Error('Enter a valid contact email.');
		const slug = `${
			companyName
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 48) || 'company'
		}-${crypto.randomUUID().slice(0, 6)}`;
		const organizationId = await ctx.db.insert('organizations', {
			name: companyName,
			slug,
			createdByUserId: user._id,
			active: false,
			pilotUseCase: useCase,
			pilotContactEmail: contactEmail,
			requestedAt: Date.now()
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

export const listPilotRequests = query({
	args: {},
	returns: v.array(organizationDocumentValidator),
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
		const organizations = await Promise.all(
			memberships.map((membership) => ctx.db.get(membership.organizationId))
		);
		return organizations.flatMap((organization) =>
			organization && !organization.active ? [organization] : []
		);
	}
});

export const approvePilot = mutation({
	args: { organizationId: v.id('organizations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const operator = await requirePlatformOperator(ctx);
		const organization = await ctx.db.get(args.organizationId);
		if (!organization) throw new Error('Pilot organization not found.');
		if (organization.active) return null;
		await ctx.db.patch(organization._id, {
			active: true,
			approvedAt: Date.now(),
			approvedByPrivyDid: operator.subject
		});
		await appendAudit(ctx, {
			organizationId: organization._id,
			actorType: 'user',
			actorId: operator.subject,
			action: 'organization.pilot_approved',
			resourceType: 'organization',
			resourceId: organization._id,
			correlationId: `pilot-approval:${organization._id}`
		});
		return null;
	}
});

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
