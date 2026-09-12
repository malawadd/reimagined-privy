import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { appendAudit } from './lib/audit';
import { orgRoleValidator, userDocumentValidator } from './lib/validators';

const role = v.union(
	v.literal('owner'),
	v.literal('admin'),
	v.literal('operator'),
	v.literal('approver'),
	v.literal('auditor')
);

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({
			membershipId: v.id('memberships'),
			role: orgRoleValidator,
			status: v.union(v.literal('active'), v.literal('suspended')),
			user: userDocumentValidator
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:read');
		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
		const rows = await Promise.all(
			memberships.map(async (membership) => ({
				membership,
				user: await ctx.db.get(membership.userId)
			}))
		);
		return rows.flatMap(({ membership, user }) =>
			user
				? [
						{
							membershipId: membership._id,
							role: membership.role,
							status: membership.status,
							user
						}
					]
				: []
		);
	}
});

export const invite = mutation({
	args: { organizationId: v.id('organizations'), email: v.string(), role },
	returns: v.id('invitations'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'team:manage');
		const invitationId = await ctx.db.insert('invitations', {
			...args,
			invitedBy: user._id,
			status: 'pending',
			expiresAt: Date.now() + 7 * 86_400_000
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: String(user.privyDid),
			action: 'member.invited',
			resourceType: 'invitation',
			resourceId: invitationId,
			correlationId: invitationId,
			metadata: { email: args.email, role: args.role }
		});
		return invitationId;
	}
});
export const changeRole = mutation({
	args: { organizationId: v.id('organizations'), membershipId: v.id('memberships'), role },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		await ctx.db.patch(args.membershipId, { role: args.role });
		return null;
	}
});
export const remove = mutation({
	args: { organizationId: v.id('organizations'), membershipId: v.id('memberships') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		if (target.role === 'owner')
			throw new Error('Transfer or delete the organization before removing its owner.');
		await ctx.db.delete(args.membershipId);
		return null;
	}
});
