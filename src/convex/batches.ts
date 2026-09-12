import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { assertOrgScoped, requireMembership } from './lib/authz';
import {
	decimalToUnits,
	normalizeDecimal,
	unitsToDecimal,
	selectPaymentRoute
} from '../lib/domain';
import { appendAudit } from './lib/audit';

const batchStatus = v.union(
	v.literal('queued'),
	v.literal('processing'),
	v.literal('completed'),
	v.literal('failed')
);
const itemStatus = v.union(
	v.literal('queued'),
	v.literal('pendingApproval'),
	v.literal('processing'),
	v.literal('succeeded'),
	v.literal('failed')
);
const batchValidator = v.object({
	_id: v.id('paymentBatches'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	type: v.union(v.literal('batch'), v.literal('payroll')),
	name: v.string(),
	asset: v.literal('USDC'),
	totalAmount: v.string(),
	itemCount: v.number(),
	status: batchStatus,
	sourceWalletId: v.id('wallets'),
	createdBy: v.id('users'),
	createdAt: v.number(),
	updatedAt: v.number()
});
const itemValidator = v.object({
	_id: v.id('paymentBatchItems'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	batchId: v.id('paymentBatches'),
	label: v.string(),
	recipientId: v.optional(v.id('recipients')),
	destination: v.string(),
	amount: v.string(),
	memo: v.optional(v.string()),
	status: itemStatus,
	operationId: v.optional(v.id('operations')),
	requestKey: v.string()
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.object({ batch: batchValidator, items: v.array(itemValidator) })),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payable:read');
		const batches = await ctx.db
			.query('paymentBatches')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return Promise.all(
			batches.map(async (batch) => ({
				batch,
				items: await ctx.db
					.query('paymentBatchItems')
					.withIndex('by_batch', (q) => q.eq('batchId', batch._id))
					.take(100)
			}))
		);
	}
});

export const createAndQueue = mutation({
	args: {
		organizationId: v.id('organizations'),
		type: v.union(v.literal('batch'), v.literal('payroll')),
		name: v.string(),
		sourceWalletId: v.id('wallets'),
		items: v.array(
			v.object({
				label: v.string(),
				recipientId: v.id('recipients'),
				amount: v.string(),
				memo: v.optional(v.string())
			})
		)
	},
	returns: v.object({ batchId: v.id('paymentBatches'), operationIds: v.array(v.id('operations')) }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'batch:manage');
		const wallet = await ctx.db.get(args.sourceWalletId);
		assertOrgScoped(wallet, args.organizationId);
		if (wallet.purpose === 'collection') throw new Error('Batches must use a treasury wallet.');
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Batch name must be 1 to 100 characters.');
		if (args.items.length < 1 || args.items.length > 100)
			throw new Error('A batch must contain 1 to 100 payments.');
		const prepared = [] as Array<{
			label: string;
			recipientId: (typeof args.items)[number]['recipientId'];
			destination: string;
			amount: string;
			memo?: string;
			path: 'automationSigner' | 'privyIntent';
		}>;
		let totalUnits = 0n;
		for (const input of args.items) {
			const recipient = await ctx.db.get(input.recipientId);
			assertOrgScoped(recipient, args.organizationId);
			if (recipient.status !== 'approved' || !recipient.assets.includes('USDC'))
				throw new Error(`Recipient ${recipient.label} is not approved for USDC.`);
			const amount = normalizeDecimal(input.amount, 6);
			if (amount === '0') throw new Error('Batch item amounts must be greater than zero.');
			const decision = selectPaymentRoute({
				asset: 'USDC',
				amount,
				destination: recipient.address,
				recipientApproved: true
			});
			if (decision.path === 'blocked') throw new Error(`Payment to ${recipient.label} is blocked.`);
			totalUnits += decimalToUnits(amount, 6);
			prepared.push({
				label: input.label.trim() || recipient.label,
				recipientId: recipient._id,
				destination: recipient.address,
				amount,
				memo: input.memo?.trim() || undefined,
				path: decision.path as 'automationSigner' | 'privyIntent'
			});
		}
		const now = Date.now();
		const batchId = await ctx.db.insert('paymentBatches', {
			organizationId: args.organizationId,
			type: args.type,
			name,
			asset: 'USDC',
			totalAmount: unitsToDecimal(totalUnits.toString(), 6),
			itemCount: prepared.length,
			status: 'processing',
			sourceWalletId: wallet._id,
			createdBy: user._id,
			createdAt: now,
			updatedAt: now
		});
		const operationIds = [];
		for (const [index, item] of prepared.entries()) {
			const requestKey = `batch:${batchId}:${index}`;
			const itemId = await ctx.db.insert('paymentBatchItems', {
				organizationId: args.organizationId,
				batchId,
				label: item.label,
				recipientId: item.recipientId,
				destination: item.destination,
				amount: item.amount,
				memo: item.memo,
				status: 'queued',
				requestKey
			});
			const operationId = await ctx.db.insert('operations', {
				organizationId: args.organizationId,
				kind: 'payment',
				status: 'queued',
				approvalPath: item.path,
				asset: 'USDC',
				amount: item.amount,
				destination: item.destination,
				memo: item.memo,
				reference: `${name} · ${item.label}`,
				requestKey,
				createdBy: user._id,
				sourceWalletId: wallet._id,
				sourceBatchItemId: itemId,
				correlationId: `payment:${args.organizationId}:${requestKey}`,
				createdAt: now,
				updatedAt: now
			});
			await ctx.db.patch(itemId, { operationId });
			operationIds.push(operationId);
			await ctx.scheduler.runAfter(0, internal.privyActions.executePayment, {
				operationId
			});
		}
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: `${args.type}.queued`,
			resourceType: 'paymentBatch',
			resourceId: batchId,
			correlationId: `batch:${batchId}`,
			metadata: {
				itemCount: prepared.length,
				totalAmount: unitsToDecimal(totalUnits.toString(), 6),
				operationIds
			}
		});
		return { batchId, operationIds };
	}
});
