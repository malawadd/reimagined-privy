import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireIdentity, requireMembership, assertOrgScoped } from './lib/authz';
import { appendAudit } from './lib/audit';
import { orgRoleValidator, userDocumentValidator } from './lib/validators';
import type { Doc, Id } from './_generated/dataModel';
import type { GenericMutationCtx } from 'convex/server';
import type { DataModel } from './_generated/dataModel';
import { normalizeInvitationEmail } from '../lib/wallet-controls';

const role = v.union(
	v.literal('owner'),
	v.literal('admin'),
	v.literal('operator'),
	v.literal('approver'),
	v.literal('auditor')
);
const walletPermission = v.union(
	v.literal('view'),
	v.literal('initiate'),
	v.literal('approve'),
	v.literal('manage')
);
const walletGrant = v.object({ walletId: v.id('wallets'), permissions: v.array(walletPermission) });

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
			.take(500);
		const rows = await Promise.all(
			memberships.map(async (membership) => ({
				membership,
				user: await ctx.db.get(membership.userId)
			}))
		);
		return rows.flatMap(({ membership, user }) =>
			user
				? [{ membershipId: membership._id, role: membership.role, status: membership.status, user }]
				: []
		);
	}
});

export const listInvitations = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:read');
		return ctx.db
			.query('invitations')
			.withIndex('by_org_email', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
	}
});

export const pendingForCurrent = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const email = verifiedEmail(identity.email);
		if (!email) return [];
		const invitations = await ctx.db
			.query('invitations')
			.withIndex('by_email_status', (q) => q.eq('normalizedEmail', email).eq('status', 'pending'))
			.take(100);
		return Promise.all(
			invitations
				.filter((invitation) => invitation.expiresAt > Date.now())
				.map(async (invitation) => ({
					...invitation,
					organization: await ctx.db.get(invitation.organizationId)
				}))
		);
	}
});

export const invite = mutation({
	args: {
		organizationId: v.id('organizations'),
		email: v.string(),
		role,
		walletGrants: v.array(walletGrant)
	},
	returns: v.id('invitations'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'team:manage');
		if (args.role === 'owner')
			throw new Error('Invite an admin, then transfer ownership explicitly.');
		const email = normalizeInvitationEmail(args.email);
		for (const grant of args.walletGrants)
			assertOrgScoped(await ctx.db.get(grant.walletId), args.organizationId);
		const duplicate = await ctx.db
			.query('invitations')
			.withIndex('by_org_email', (q) =>
				q.eq('organizationId', args.organizationId).eq('email', email)
			)
			.filter((q) => q.eq(q.field('status'), 'pending'))
			.first();
		if (duplicate) throw new Error('A pending invitation already exists for this email.');
		const walletGrants = args.walletGrants.map((grant) => ({
			walletId: grant.walletId,
			permissions: [...new Set(grant.permissions)]
		}));
		const invitationId = await ctx.db.insert('invitations', {
			organizationId: args.organizationId,
			email,
			normalizedEmail: email,
			role: args.role,
			walletGrants,
			invitedBy: user._id,
			status: 'pending',
			expiresAt: Date.now() + 7 * 86_400_000
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'member.invited',
			resourceType: 'invitation',
			resourceId: invitationId,
			correlationId: String(invitationId),
			metadata: { email, role: args.role, walletCount: walletGrants.length }
		});
		return invitationId;
	}
});

export const acceptInvitation = mutation({
	args: { invitationId: v.id('invitations') },
	returns: v.id('memberships'),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const user = await ctx.db
			.query('users')
			.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
			.unique();
		if (!user) throw new Error('Sync the current user first.');
		const invitation = await ctx.db.get(args.invitationId);
		if (!invitation || invitation.status !== 'pending') throw new Error('Invitation not found.');
		if (invitation.expiresAt <= Date.now()) throw new Error('Invitation has expired.');
		const email = verifiedEmail(identity.email);
		if (!email || email !== (invitation.normalizedEmail ?? invitation.email.toLowerCase()))
			throw new Error('This invitation belongs to a different verified email.');
		let membership = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', invitation.organizationId).eq('userId', user._id)
			)
			.unique();
		if (membership) {
			await ctx.db.patch(membership._id, { role: invitation.role, status: 'active' });
		} else {
			const membershipId = await ctx.db.insert('memberships', {
				organizationId: invitation.organizationId,
				userId: user._id,
				role: invitation.role,
				status: 'active'
			});
			membership = await ctx.db.get(membershipId);
		}
		if (!membership) throw new Error('Membership could not be created.');
		for (const grant of invitation.walletGrants ?? []) {
			const wallet = await ctx.db.get(grant.walletId);
			assertOrgScoped(wallet, invitation.organizationId);
			const approvalPending = grant.permissions.includes('approve');
			const existing = await ctx.db
				.query('walletAssignments')
				.withIndex('by_wallet_user', (q) => q.eq('walletId', wallet._id).eq('userId', user._id))
				.unique();
			if (existing)
				await ctx.db.patch(existing._id, {
					permissions: grant.permissions,
					status: approvalPending ? 'pending' : 'active',
					updatedAt: Date.now()
				});
			else
				await ctx.db.insert('walletAssignments', {
					organizationId: invitation.organizationId,
					walletId: wallet._id,
					userId: user._id,
					permissions: grant.permissions,
					status: approvalPending ? 'pending' : 'active',
					updatedAt: Date.now()
				});
			if (approvalPending) await queueReviewerAddition(ctx, wallet, user);
		}
		await ctx.db.patch(invitation._id, { status: 'accepted' });
		await appendAudit(ctx, {
			organizationId: invitation.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'member.invitation_accepted',
			resourceType: 'membership',
			resourceId: membership._id,
			correlationId: String(invitation._id)
		});
		return membership._id;
	}
});

export const declineInvitation = mutation({
	args: { invitationId: v.id('invitations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const invitation = await ctx.db.get(args.invitationId);
		if (!invitation || invitation.status !== 'pending') throw new Error('Invitation not found.');
		const email = verifiedEmail(identity.email);
		if (!email || email !== (invitation.normalizedEmail ?? invitation.email.toLowerCase()))
			throw new Error('This invitation belongs to a different verified email.');
		await ctx.db.patch(invitation._id, { status: 'declined' });
		return null;
	}
});

export const revokeInvitation = mutation({
	args: { organizationId: v.id('organizations'), invitationId: v.id('invitations') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const invitation = await ctx.db.get(args.invitationId);
		assertOrgScoped(invitation, args.organizationId);
		if (invitation.status === 'pending') await ctx.db.patch(invitation._id, { status: 'revoked' });
		return null;
	}
});

export const changeRole = mutation({
	args: { organizationId: v.id('organizations'), membershipId: v.id('memberships'), role },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		if (target.role === 'owner' && args.role !== 'owner') await requireAnotherOwner(ctx, target);
		await ctx.db.patch(args.membershipId, { role: args.role });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'member.role_changed',
			resourceType: 'membership',
			resourceId: target._id,
			correlationId: `role:${target._id}:${Date.now()}`,
			metadata: { from: target.role, to: args.role }
		});
		return null;
	}
});

export const suspend = mutation({
	args: { organizationId: v.id('organizations'), membershipId: v.id('memberships') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		if (target.role === 'owner') await requireAnotherOwner(ctx, target);
		await ctx.db.patch(target._id, { status: 'suspended' });
		const assignments = await ctx.db
			.query('walletAssignments')
			.withIndex('by_user', (q) => q.eq('userId', target.userId))
			.take(500);
		for (const assignment of assignments)
			if (assignment.organizationId === args.organizationId)
				await ctx.db.patch(assignment._id, { status: 'suspended', updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'member.suspended',
			resourceType: 'membership',
			resourceId: target._id,
			correlationId: `suspend:${target._id}:${Date.now()}`
		});
		return null;
	}
});

export const restore = mutation({
	args: { organizationId: v.id('organizations'), membershipId: v.id('memberships') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:manage');
		const target = await ctx.db.get(args.membershipId);
		assertOrgScoped(target, args.organizationId);
		await ctx.db.patch(target._id, { status: 'active' });
		return null;
	}
});

export const remove = suspend;

function verifiedEmail(value: unknown) {
	return typeof value === 'string' ? normalizeInvitationEmail(value) : null;
}

async function requireAnotherOwner(
	ctx: Parameters<typeof requireMembership>[0],
	target: { organizationId: Id<'organizations'>; _id: Id<'memberships'> }
) {
	const memberships = await ctx.db
		.query('memberships')
		.withIndex('by_org_user', (q) => q.eq('organizationId', target.organizationId))
		.take(500);
	if (
		!memberships.some(
			(member) => member._id !== target._id && member.role === 'owner' && member.status === 'active'
		)
	)
		throw new Error('An organization must keep at least one active owner.');
}

async function queueReviewerAddition(
	ctx: GenericMutationCtx<DataModel>,
	wallet: Doc<'wallets'>,
	user: Doc<'users'>
) {
	const existingReviewer = await ctx.db
		.query('reviewerMembers')
		.withIndex('by_wallet_user', (q) => q.eq('walletId', wallet._id).eq('userId', user._id))
		.unique();
	if (existingReviewer?.status === 'active' || existingReviewer?.status === 'pending') return;
	const reviewers = await ctx.db
		.query('reviewerMembers')
		.withIndex('by_org', (q) => q.eq('organizationId', wallet.organizationId))
		.take(500);
	const userIds = [
		...new Set([
			...reviewers
				.filter((reviewer) => reviewer.walletId === wallet._id && reviewer.status !== 'removing')
				.map((reviewer) => reviewer.privyDid),
			user.privyDid
		])
	];
	const now = Date.now();
	const operationId = await ctx.db.insert('operations', {
		organizationId: wallet.organizationId,
		kind: 'quorumUpdate',
		status: 'queued',
		approvalPath: 'privyIntent',
		reference: `Add ${user.name ?? user.email ?? 'member'} to ${wallet.name} approvers`,
		createdBy: user._id,
		sourceWalletId: wallet._id,
		correlationId: `quorum-add:${wallet._id}:${user._id}:${crypto.randomUUID()}`,
		createdAt: now,
		updatedAt: now
	});
	if (existingReviewer)
		await ctx.db.patch(existingReviewer._id, { status: 'pending', updatedAt: now });
	else
		await ctx.db.insert('reviewerMembers', {
			organizationId: wallet.organizationId,
			walletId: wallet._id,
			userId: user._id,
			privyDid: user.privyDid,
			status: 'pending',
			updatedAt: now
		});
	await ctx.db.insert('quorumChangeRequests', {
		organizationId: wallet.organizationId,
		operationId,
		walletId: wallet._id,
		userId: user._id,
		action: 'add',
		requestedThreshold: wallet.approvalThreshold ?? 1,
		createdAt: now
	});
	await ctx.scheduler.runAfter(0, internal.privyActions.requestQuorumUpdate, {
		operationId,
		privyQuorumId: wallet.ownerQuorumId,
		userIds,
		threshold: wallet.approvalThreshold ?? 1
	});
}
