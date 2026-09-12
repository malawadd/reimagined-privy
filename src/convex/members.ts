import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { appendAudit } from './lib/audit';

const role = v.union(
	v.literal('owner'),
	v.literal('admin'),
	v.literal('operator'),
	v.literal('approver'),
	v.literal('auditor')
);
export const invite = mutation({
	args: { organizationId: v.id('organizations'), email: v.string(), role },
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
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		await ctx.db.patch(args.membershipId, { role: args.role });
	}
});
export const remove = mutation({
	args: { organizationId: v.id('organizations'), membershipId: v.id('memberships') },
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		if (target.role === 'owner')
			throw new Error('Transfer or delete the organization before removing its owner.');
		await ctx.db.delete(args.membershipId);
	}
});
