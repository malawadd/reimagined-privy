import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { normalizeDecimal, normalizeEvmAddress, selectPaymentRoute } from '../lib/domain';
import { appendAudit } from './lib/audit';

const payableValidator = v.object({
	_id: v.id('payables'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	type: v.union(v.literal('bill'), v.literal('expense')),
	reference: v.string(),
	payeeName: v.string(),
	recipientId: v.optional(v.id('recipients')),
	destination: v.string(),
	asset: v.literal('USDC'),
	amount: v.string(),
	dueAt: v.number(),
	category: v.optional(v.string()),
	memo: v.optional(v.string()),
	receiptStorageId: v.optional(v.id('_storage')),
	status: v.union(
		v.literal('draft'),
		v.literal('paymentQueued'),
		v.literal('paid'),
		v.literal('failed'),
		v.literal('void')
	),
	operationId: v.optional(v.id('operations')),
	createdBy: v.id('users'),
	createdAt: v.number(),
	updatedAt: v.number()
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({ payable: payableValidator, receiptUrl: v.union(v.null(), v.string()) })
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payable:read');
		const payables = await ctx.db
			.query('payables')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(250);
		return Promise.all(
			payables.map(async (payable) => ({
				payable,
				receiptUrl: payable.receiptStorageId
					? await ctx.storage.getUrl(payable.receiptStorageId)
					: null
			}))
		);
	}
});

export const generateReceiptUploadUrl = mutation({
	args: { organizationId: v.id('organizations') },
	returns: v.string(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payable:manage');
		return ctx.storage.generateUploadUrl();
	}
});

export const create = mutation({
	args: {
		organizationId: v.id('organizations'),
		type: v.union(v.literal('bill'), v.literal('expense')),
		reference: v.string(),
		payeeName: v.string(),
		recipientId: v.optional(v.id('recipients')),
		destination: v.string(),
		amount: v.string(),
		dueAt: v.number(),
		category: v.optional(v.string()),
		memo: v.optional(v.string()),
		receiptStorageId: v.optional(v.id('_storage'))
	},
	returns: v.id('payables'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'payable:manage');
		const reference = args.reference.trim();
		const payeeName = args.payeeName.trim();
		if (!reference || reference.length > 80)
			throw new Error('Reference must be 1 to 80 characters.');
		if (!payeeName || payeeName.length > 120)
			throw new Error('Payee name must be 1 to 120 characters.');
		const duplicate = await ctx.db
			.query('payables')
			.withIndex('by_org_reference', (q) =>
				q.eq('organizationId', args.organizationId).eq('reference', reference)
			)
			.unique();
		if (duplicate) throw new Error('Payable reference already exists.');
		const destination = normalizeEvmAddress(args.destination);
		if (args.recipientId) {
			const recipient = await ctx.db.get(args.recipientId);
			assertOrgScoped(recipient, args.organizationId);
			if (recipient.address !== destination)
				throw new Error('Recipient address does not match the payable destination.');
		}
		const amount = normalizeDecimal(args.amount, 6);
		if (amount === '0') throw new Error('Amount must be greater than zero.');
		const now = Date.now();
		const payableId = await ctx.db.insert('payables', {
			organizationId: args.organizationId,
			type: args.type,
			reference,
			payeeName,
			recipientId: args.recipientId,
			destination,
			asset: 'USDC',
			amount,
			dueAt: args.dueAt,
			category: args.category?.trim() || undefined,
			memo: args.memo?.trim() || undefined,
			receiptStorageId: args.receiptStorageId,
			status: 'draft',
			createdBy: user._id,
			createdAt: now,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: `${args.type}.created`,
			resourceType: 'payable',
			resourceId: payableId,
			correlationId: `payable:${payableId}`,
			metadata: { reference, amount, destination }
		});
		return payableId;
	}
});

export const queuePayment = mutation({
	args: {
		organizationId: v.id('organizations'),
		payableId: v.id('payables'),
		walletId: v.id('wallets')
	},
	returns: v.object({
		operationId: v.id('operations'),
		path: v.union(v.literal('automationSigner'), v.literal('privyIntent')),
		deduplicated: v.boolean()
	}),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'payable:manage');
		const [payable, wallet] = await Promise.all([
			ctx.db.get(args.payableId),
			ctx.db.get(args.walletId)
		]);
		assertOrgScoped(payable, args.organizationId);
		assertOrgScoped(wallet, args.organizationId);
		if (payable.status === 'void' || payable.status === 'paid')
			throw new Error('This payable cannot be queued.');
		if (payable.operationId) {
			const operation = await ctx.db.get(payable.operationId);
			if (operation?.approvalPath)
				return { operationId: operation._id, path: operation.approvalPath, deduplicated: true };
		}
		const recipient = await ctx.db
			.query('recipients')
			.withIndex('by_org_address', (q) =>
				q.eq('organizationId', args.organizationId).eq('address', payable.destination)
			)
			.unique();
		const decision = selectPaymentRoute({
			asset: 'USDC',
			amount: payable.amount,
			destination: payable.destination,
			recipientApproved: recipient?.status === 'approved' && recipient.assets.includes('USDC')
		});
		if (decision.path === 'blocked')
			throw new Error('Policy change is required before this payable can execute.');
		const path = decision.path as 'automationSigner' | 'privyIntent';
		const now = Date.now();
		const requestKey = `payable:${payable._id}`;
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'payment',
			status: 'queued',
			approvalPath: path,
			asset: 'USDC',
			amount: payable.amount,
			destination: payable.destination,
			memo: payable.memo,
			reference: payable.reference,
			requestKey,
			createdBy: user._id,
			sourceWalletId: wallet._id,
			sourcePayableId: payable._id,
			correlationId: `payment:${args.organizationId}:${requestKey}`,
			createdAt: now,
			updatedAt: now
		});
		await ctx.db.patch(payable._id, { status: 'paymentQueued', operationId, updatedAt: now });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: `${payable.type}.payment_queued`,
			resourceType: 'payable',
			resourceId: payable._id,
			correlationId: `payable:${payable._id}`,
			metadata: { operationId, path }
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.executePayment, {
			operationId
		});
		return { operationId, path, deduplicated: false };
	}
});

export const voidPayable = mutation({
	args: { organizationId: v.id('organizations'), payableId: v.id('payables') },
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payable:manage');
		const payable = await ctx.db.get(args.payableId);
		assertOrgScoped(payable, args.organizationId);
		if (payable.status !== 'draft') throw new Error('Only draft payables can be voided.');
		await ctx.db.patch(payable._id, { status: 'void', updatedAt: Date.now() });
		return null;
	}
});
