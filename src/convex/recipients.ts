import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { normalizeEvmAddress } from '../lib/domain';
import { appendAudit } from './lib/audit';

const recipientValidator = v.object({
	_id: v.id('recipients'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	label: v.string(),
	address: v.string(),
	assets: v.array(v.union(v.literal('ETH'), v.literal('USDC'))),
	status: v.union(v.literal('pendingApproval'), v.literal('approved'), v.literal('revoked')),
	createdBy: v.id('users'),
	approvedBy: v.optional(v.id('users')),
	approvedAt: v.optional(v.number())
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(recipientValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'wallet:read');
		return ctx.db
			.query('recipients')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(250);
	}
});

export const create = mutation({
	args: {
		organizationId: v.id('organizations'),
		label: v.string(),
		address: v.string(),
		assets: v.array(v.union(v.literal('ETH'), v.literal('USDC')))
	},
	returns: v.id('recipients'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'payment:create');
		const label = args.label.trim();
		if (!label || label.length > 100)
			throw new Error('Enter a recipient label up to 100 characters.');
		if (args.assets.length === 0) throw new Error('Select at least one allowed asset.');
		const address = normalizeEvmAddress(args.address);
		const existing = await ctx.db
			.query('recipients')
			.withIndex('by_org_address', (q) =>
				q.eq('organizationId', args.organizationId).eq('address', address)
			)
			.unique();
		if (existing && existing.status !== 'revoked')
			throw new Error('Recipient already exists in this organization.');
		if (existing) {
			await ctx.db.patch(existing._id, {
				label,
				assets: [...new Set(args.assets)],
				status: 'pendingApproval',
				createdBy: user._id,
				approvedBy: undefined,
				approvedAt: undefined
			});
			return existing._id;
		}
		const recipientId = await ctx.db.insert('recipients', {
			organizationId: args.organizationId,
			label,
			address,
			assets: [...new Set(args.assets)],
			status: 'pendingApproval',
			createdBy: user._id
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'recipient.approval_requested',
			resourceType: 'recipient',
			resourceId: recipientId,
			correlationId: `recipient:${recipientId}`,
			metadata: { label, address, assets: args.assets }
		});
		return recipientId;
	}
});

export const approve = mutation({
	args: { organizationId: v.id('organizations'), recipientId: v.id('recipients') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'policy:manage');
		const recipient = await ctx.db.get(args.recipientId);
		assertOrgScoped(recipient, args.organizationId);
		if (recipient.status !== 'pendingApproval')
			throw new Error('This counterparty is not waiting for approval.');
		if (recipient.createdBy === user._id)
			throw new Error('A different authorized member must approve this counterparty.');
		await ctx.db.patch(recipient._id, {
			status: 'approved',
			approvedBy: user._id,
			approvedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'recipient.approved',
			resourceType: 'recipient',
			resourceId: recipient._id,
			correlationId: `recipient:${recipient._id}`,
			metadata: { address: recipient.address, requestedBy: recipient.createdBy }
		});
		return null;
	}
});

export const revoke = mutation({
	args: { organizationId: v.id('organizations'), recipientId: v.id('recipients') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'payment:create');
		const recipient = await ctx.db.get(args.recipientId);
		assertOrgScoped(recipient, args.organizationId);
		await ctx.db.patch(recipient._id, { status: 'revoked' });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'recipient.revoked',
			resourceType: 'recipient',
			resourceId: recipient._id,
			correlationId: `recipient:${recipient._id}`,
			metadata: { address: recipient.address }
		});
		return null;
	}
});
