import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { appendAudit } from './lib/audit';
import type { Id } from './_generated/dataModel';
import { assertSatisfiableQuorum, canonicalWalletPermissions } from '../lib/wallet-controls';

const walletPermission = v.union(
	v.literal('view'),
	v.literal('initiate'),
	v.literal('approve'),
	v.literal('manage')
);
type WalletPermission = 'view' | 'initiate' | 'approve' | 'manage';
const allPermissions: WalletPermission[] = ['view', 'initiate', 'approve', 'manage'];

export const listForWallet = query({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'team:read');
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		const assignments = await ctx.db
			.query('walletAssignments')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(500);
		const rows = await Promise.all(
			assignments
				.filter((assignment) => assignment.walletId === args.walletId)
				.map(async (assignment) => ({
					...assignment,
					user: await ctx.db.get(assignment.userId)
				}))
		);
		return rows.filter((row) => row.user);
	}
});

export const currentPermissions = query({
	args: { organizationId: v.id('organizations'), walletId: v.id('wallets') },
	returns: v.array(walletPermission),
	handler: async (ctx, args) => {
		const { user, membership } = await requireMembership(ctx, args.organizationId);
		const wallet = await ctx.db.get(args.walletId);
		assertOrgScoped(wallet, args.organizationId);
		if (membership.role === 'owner') return allPermissions;
		const assignment = await ctx.db
			.query('walletAssignments')
			.withIndex('by_wallet_user', (q) => q.eq('walletId', args.walletId).eq('userId', user._id))
			.unique();
		return assignment?.status === 'active' ? assignment.permissions : [];
	}
});

export const set = mutation({
	args: {
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		membershipId: v.id('memberships'),
		permissions: v.array(walletPermission)
	},
	returns: v.object({ operationId: v.optional(v.id('operations')) }),
	handler: async (ctx, args) => {
		const { user: actor } = await requireMembership(ctx, args.organizationId, 'team:manage');
		const wallet = await ctx.db.get(args.walletId);
		const membership = await ctx.db.get(args.membershipId);
		assertOrgScoped(wallet, args.organizationId);
		assertOrgScoped(membership, args.organizationId);
		if (membership.status !== 'active')
			throw new Error('Suspended members cannot receive wallet access.');
		const targetUser = await ctx.db.get(membership.userId);
		if (!targetUser) throw new Error('Member identity not found.');
		const permissions = canonicalWalletPermissions(args.permissions as WalletPermission[]);
		const current = await ctx.db
			.query('walletAssignments')
			.withIndex('by_wallet_user', (q) => q.eq('walletId', wallet._id).eq('userId', targetUser._id))
			.unique();
		const approvalChanged =
			Boolean(current?.permissions.includes('approve')) !== permissions.includes('approve');
		let operationId: Id<'operations'> | undefined;
		let assignmentStatus: 'active' | 'pending' | 'suspended' = permissions.length
			? 'active'
			: 'suspended';

		if (approvalChanged) {
			const reviewers = await ctx.db
				.query('reviewerMembers')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(500);
			const walletReviewers = reviewers.filter(
				(reviewer) => reviewer.walletId === wallet._id && reviewer.status !== 'removing'
			);
			const adding = permissions.includes('approve');
			const prospective = adding
				? [
						...new Set([
							...walletReviewers.map((reviewer) => reviewer.privyDid),
							targetUser.privyDid
						])
					]
				: walletReviewers
						.filter((reviewer) => reviewer.userId !== targetUser._id)
						.map((reviewer) => reviewer.privyDid);
			const threshold = wallet.approvalThreshold ?? 1;
			assertSatisfiableQuorum(threshold, prospective.length);
			const now = Date.now();
			operationId = await ctx.db.insert('operations', {
				organizationId: args.organizationId,
				kind: 'quorumUpdate',
				status: 'queued',
				approvalPath: 'privyIntent',
				reference: `${adding ? 'Add' : 'Remove'} ${targetUser.name ?? targetUser.email ?? 'member'} ${adding ? 'to' : 'from'} ${wallet.name} approvers`,
				createdBy: actor._id,
				sourceWalletId: wallet._id,
				correlationId: `quorum-update:${wallet._id}:${crypto.randomUUID()}`,
				createdAt: now,
				updatedAt: now
			});
			await ctx.db.insert('quorumChangeRequests', {
				organizationId: args.organizationId,
				operationId,
				walletId: wallet._id,
				userId: targetUser._id,
				action: adding ? 'add' : 'remove',
				requestedThreshold: threshold,
				createdAt: now
			});
			const reviewer = await ctx.db
				.query('reviewerMembers')
				.withIndex('by_wallet_user', (q) =>
					q.eq('walletId', wallet._id).eq('userId', targetUser._id)
				)
				.unique();
			if (reviewer)
				await ctx.db.patch(reviewer._id, {
					status: adding ? 'pending' : 'removing',
					updatedAt: now
				});
			else if (adding)
				await ctx.db.insert('reviewerMembers', {
					organizationId: args.organizationId,
					walletId: wallet._id,
					userId: targetUser._id,
					privyDid: targetUser.privyDid,
					status: 'pending',
					updatedAt: now
				});
			assignmentStatus = 'pending';
			await ctx.scheduler.runAfter(0, internal.privyActions.requestQuorumUpdate, {
				operationId,
				privyQuorumId: wallet.ownerQuorumId,
				userIds: prospective,
				threshold
			});
		}

		if (current)
			await ctx.db.patch(current._id, {
				permissions,
				status: assignmentStatus,
				updatedAt: Date.now()
			});
		else
			await ctx.db.insert('walletAssignments', {
				organizationId: args.organizationId,
				walletId: wallet._id,
				userId: targetUser._id,
				permissions,
				status: assignmentStatus,
				updatedAt: Date.now()
			});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: actor.privyDid,
			action: 'wallet.assignment_updated',
			resourceType: 'wallet',
			resourceId: wallet._id,
			correlationId: operationId
				? String(operationId)
				: `assignment:${wallet._id}:${targetUser._id}`,
			metadata: {
				userId: targetUser._id,
				permissions,
				providerApprovalPending: Boolean(operationId)
			}
		});
		return { operationId };
	}
});
