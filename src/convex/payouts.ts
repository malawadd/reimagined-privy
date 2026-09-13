import { v } from 'convex/values';
import type { GenericMutationCtx } from 'convex/server';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { DataModel, Doc, Id } from './_generated/dataModel';
import { assertOrgScoped, requireMembership, requireWalletPermission } from './lib/authz';
import {
	activeAutomationPolicyAllows,
	assertUniquePayrollMembers,
	normalizePayoutRunKey,
	payoutAttemptKey,
	payoutItemRequestKey,
	totalPayoutAmount
} from '../lib/payout-domain';
import { assetDecimals, decimalToUnits, normalizeDecimal, unitsToDecimal } from '../lib/domain';
import type { Asset } from '../lib/domain';
import { resolvePayrollDestination } from '../lib/wallet-controls';
import { appendAudit } from './lib/audit';
import { postSourceJournal } from './lib/accounting';

const moneyComponent = v.object({ label: v.string(), amount: v.string() });
const draftItem = v.object({
	label: v.optional(v.string()),
	recipientId: v.optional(v.id('recipients')),
	userId: v.optional(v.id('users')),
	amount: v.optional(v.string()),
	memo: v.optional(v.string()),
	sourceRow: v.optional(v.number()),
	earnings: v.optional(v.array(moneyComponent)),
	deductions: v.optional(v.array(moneyComponent))
});

export const list = query({
	args: {
		organizationId: v.id('organizations'),
		type: v.optional(v.union(v.literal('batch'), v.literal('payroll')))
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(
			ctx,
			args.organizationId,
			args.type === 'payroll' ? 'payroll:read' : 'payout:read'
		);
		const batches = await ctx.db
			.query('paymentBatches')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return Promise.all(
			batches
				.filter((batch) => !args.type || batch.type === args.type)
				.map(async (batch) => {
					const items = await ctx.db
						.query('paymentBatchItems')
						.withIndex('by_batch', (q) => q.eq('batchId', batch._id))
						.take(100);
					const attempts = await Promise.all(
						items.map(async (item) =>
							item.operationId
								? await ctx.db
										.query('providerAttempts')
										.withIndex('by_operation', (q) => q.eq('operationId', item.operationId!))
										.order('desc')
										.first()
								: null
						)
					);
					return {
						batch,
						items: items.map((item, index) => ({ ...item, attempt: attempts[index] }))
					};
				})
		);
	}
});

export const saveDraft = mutation({
	args: {
		organizationId: v.id('organizations'),
		batchId: v.optional(v.id('paymentBatches')),
		type: v.union(v.literal('batch'), v.literal('payroll')),
		name: v.string(),
		sourceWalletId: v.id('wallets'),
		asset: v.optional(v.union(v.literal('ETH'), v.literal('USDC'))),
		idempotencyKey: v.string(),
		scheduledFor: v.optional(v.number()),
		payPeriodStart: v.optional(v.string()),
		payPeriodEnd: v.optional(v.string()),
		payDate: v.optional(v.string()),
		payrollKind: v.optional(v.union(v.literal('regular'), v.literal('offCycle'))),
		denominationCurrency: v.optional(v.string()),
		items: v.array(draftItem)
	},
	returns: v.object({
		batchId: v.id('paymentBatches'),
		revision: v.number(),
		deduplicated: v.boolean()
	}),
	handler: async (ctx, args) => {
		const capability = args.type === 'payroll' ? 'payroll:manage' : 'payout:manage';
		const { user, wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			args.sourceWalletId,
			'initiate',
			capability
		);
		if (wallet.purpose === 'collection') throw new Error('Payouts must use a treasury wallet.');
		const name = args.name.trim();
		if (!name || name.length > 100) throw new Error('Run name must be 1 to 100 characters.');
		if (args.items.length < 1 || args.items.length > 100)
			throw new Error('A payout run must contain 1 to 100 payments.');
		const suppliedRequestKey = normalizePayoutRunKey(args.idempotencyKey);
		const asset = args.asset ?? 'USDC';
		if (args.type === 'payroll') validatePayPeriod({ ...args, asset });

		let existing: Doc<'paymentBatches'> | null;
		if (args.batchId) {
			existing = await ctx.db.get(args.batchId);
			assertOrgScoped(existing, args.organizationId);
			if (existing.status !== 'draft') throw new Error('Only a draft payout run can be edited.');
			if (existing.type !== args.type) throw new Error('Payout run type cannot be changed.');
			if (existing.asset !== asset) throw new Error('Payout run asset cannot be changed.');
			if (existing.requestKey && existing.requestKey !== suppliedRequestKey)
				throw new Error('A payout draft idempotency key cannot be changed.');
		} else {
			existing = await ctx.db
				.query('paymentBatches')
				.withIndex('by_org_request', (q) =>
					q.eq('organizationId', args.organizationId).eq('requestKey', suppliedRequestKey)
				)
				.unique();
			if (existing)
				return {
					batchId: existing._id,
					revision: existing.revision ?? 1,
					deduplicated: true
				};
		}

		const requestKey = existing?.requestKey ?? suppliedRequestKey;
		const revision = (existing?.revision ?? 0) + 1;
		const prepared = await prepareDraftItems(ctx, {
			organizationId: args.organizationId,
			type: args.type,
			requestKey,
			revision,
			asset,
			denominationCurrency: args.denominationCurrency,
			items: args.items
		});
		const totalAmount = totalPayoutAmount(
			prepared.map((item) => item.amount),
			asset
		);
		const now = Date.now();
		const batchPatch = {
			name,
			totalAmount,
			itemCount: prepared.length,
			status: 'draft' as const,
			requestKey,
			revision,
			scheduledFor: args.scheduledFor,
			payPeriodStart: args.payPeriodStart,
			payPeriodEnd: args.payPeriodEnd,
			payDate: args.payDate,
			payrollKind: args.type === 'payroll' ? (args.payrollKind ?? 'regular') : undefined,
			denominationCurrency: args.denominationCurrency?.trim().toUpperCase(),
			sourceWalletId: wallet._id,
			updatedAt: now
		};
		let batchId: Id<'paymentBatches'>;
		if (existing) {
			batchId = existing._id;
			const oldItems = await ctx.db
				.query('paymentBatchItems')
				.withIndex('by_batch', (q) => q.eq('batchId', batchId))
				.take(101);
			if (oldItems.some((item) => item.operationId))
				throw new Error('A dispatched payout run cannot be edited.');
			for (const item of oldItems) await ctx.db.delete(item._id);
			await ctx.db.patch(batchId, batchPatch);
		} else {
			batchId = await ctx.db.insert('paymentBatches', {
				organizationId: args.organizationId,
				type: args.type,
				asset,
				createdBy: user._id,
				createdAt: now,
				...batchPatch
			});
		}
		for (const item of prepared)
			await ctx.db.insert('paymentBatchItems', {
				organizationId: args.organizationId,
				batchId,
				status: 'ready',
				...item
			});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: existing ? 'payout.draft_updated' : 'payout.draft_created',
			resourceType: 'paymentBatch',
			resourceId: batchId,
			correlationId: `batch:${batchId}`,
			metadata: { revision, itemCount: prepared.length, totalAmount }
		});
		return { batchId, revision, deduplicated: false };
	}
});

export const finalize = mutation({
	args: { organizationId: v.id('organizations'), batchId: v.id('paymentBatches') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const batch = await getManagedBatch(ctx, args.organizationId, args.batchId, 'initiate');
		if (batch.status !== 'draft') throw new Error('Only a draft payout run can be finalized.');
		const items = await ctx.db
			.query('paymentBatchItems')
			.withIndex('by_batch', (q) => q.eq('batchId', batch._id))
			.take(101);
		if (!items.length || items.length > 100) throw new Error('Draft item count is invalid.');
		const wallet = await ctx.db.get(batch.sourceWalletId);
		assertOrgScoped(wallet, args.organizationId);
		const [assetBalance, ethBalance, policies] = await Promise.all([
			ctx.db
				.query('walletBalances')
				.withIndex('by_wallet_asset', (q) => q.eq('walletId', wallet._id).eq('asset', batch.asset))
				.unique(),
			ctx.db
				.query('walletBalances')
				.withIndex('by_wallet_asset', (q) => q.eq('walletId', wallet._id).eq('asset', 'ETH'))
				.unique(),
			ctx.db
				.query('policies')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100)
		]);
		if (!assetBalance || !ethBalance)
			throw new Error('Refresh treasury balances before finalizing this payout run.');
		const decimals = assetDecimals(batch.asset);
		const available = decimalToUnits(assetBalance.displayValue, decimals);
		const required = decimalToUnits(batch.totalAmount, decimals);
		if (available < required || (batch.asset === 'ETH' && available === required))
			throw new Error(
				`Treasury ${batch.asset} balance must cover the payout run and network fees.`
			);
		if (batch.asset === 'USDC' && decimalToUnits(ethBalance.displayValue, 18) === 0n)
			throw new Error('Treasury ETH balance is empty; add Base Sepolia gas before finalizing.');
		const runAllowsAutomation =
			batch.asset === 'USDC' && decimalToUnits(batch.totalAmount, 6) <= decimalToUnits('100', 6);
		for (const item of items) {
			await verifyFrozenDestination(ctx, batch, item);
			const automationAllowed =
				runAllowsAutomation &&
				activeAutomationPolicyAllows({
					policies,
					walletPolicyIds: wallet.policyIds,
					amount: item.amount,
					destination: item.destination,
					asset: batch.asset
				});
			await ctx.db.patch(item._id, {
				routeReason: automationAllowed
					? 'Preflight confirmed current Privy automation policy coverage.'
					: 'Preflight requires a separately signed Privy approval intent.'
			});
		}
		await ctx.db.patch(batch._id, {
			status: 'ready',
			finalizedAt: Date.now(),
			updatedAt: Date.now()
		});
		await auditRun(ctx, batch, 'payout.finalized');
		return null;
	}
});

export const submitForApproval = mutation({
	args: { organizationId: v.id('organizations'), batchId: v.id('paymentBatches') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const batch = await getManagedBatch(ctx, args.organizationId, args.batchId, 'initiate');
		if (batch.status !== 'ready') throw new Error('Finalize the payout run before approval.');
		const now = Date.now();
		await ctx.db.patch(batch._id, {
			status: 'pendingApproval',
			submittedAt: now,
			updatedAt: now
		});
		await updateDraftItemStatuses(ctx, batch._id, 'pendingApproval');
		await auditRun(ctx, batch, 'payout.approval_requested');
		return null;
	}
});

export const approve = mutation({
	args: { organizationId: v.id('organizations'), batchId: v.id('paymentBatches') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const batch = await ctx.db.get(args.batchId);
		assertOrgScoped(batch, args.organizationId);
		const { user } = await requireWalletPermission(
			ctx,
			args.organizationId,
			batch.sourceWalletId,
			'approve',
			batch.type === 'payroll' ? 'payroll:read' : 'payout:read'
		);
		if (batch.status !== 'pendingApproval') throw new Error('Payout run is not awaiting approval.');
		if (batch.createdBy === user._id)
			throw new Error('The payout creator cannot approve the same run.');
		const now = Date.now();
		const status =
			batch.scheduledFor && batch.scheduledFor > now
				? ('scheduled' as const)
				: ('approved' as const);
		await ctx.db.patch(batch._id, {
			status,
			approvedAt: now,
			approvedBy: user._id,
			updatedAt: now
		});
		await updateDraftItemStatuses(ctx, batch._id, 'ready');
		if (batch.type === 'payroll')
			await postSourceJournal(ctx, {
				organizationId: args.organizationId,
				sourceKey: `payroll:${batch._id}:approved`,
				sourceType: 'payroll',
				amount: batch.totalAmount,
				asset: batch.asset,
				postingDate: now,
				description: `${batch.name} payroll approved`,
				isPayrollAccrual: true
			});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'payout.approved',
			resourceType: 'paymentBatch',
			resourceId: batch._id,
			correlationId: `batch:${batch._id}`,
			metadata: { scheduledFor: batch.scheduledFor }
		});
		return null;
	}
});

export const dispatch = mutation({
	args: { organizationId: v.id('organizations'), batchId: v.id('paymentBatches') },
	returns: v.object({ operationIds: v.array(v.id('operations')) }),
	handler: async (ctx, args) => {
		const batch = await getManagedBatch(ctx, args.organizationId, args.batchId, 'initiate');
		if (!['approved', 'scheduled'].includes(batch.status))
			throw new Error('Payout run must be approved before dispatch.');
		if (batch.status === 'scheduled' && (batch.scheduledFor ?? Infinity) > Date.now())
			throw new Error('Scheduled payout run is not due.');
		return { operationIds: await dispatchRun(ctx, batch) };
	}
});

export const dispatchDue = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const now = Date.now();
		const due = await ctx.db
			.query('paymentBatches')
			.withIndex('by_status_schedule', (q) => q.eq('status', 'scheduled').lte('scheduledFor', now))
			.take(20);
		for (const batch of due) await dispatchRun(ctx, batch);
		return due.length;
	}
});

export const cancel = mutation({
	args: { organizationId: v.id('organizations'), batchId: v.id('paymentBatches') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const batch = await getManagedBatch(ctx, args.organizationId, args.batchId, 'initiate');
		if (!['draft', 'ready', 'pendingApproval', 'approved', 'scheduled'].includes(batch.status))
			throw new Error('A dispatched payout run cannot be cancelled.');
		const items = await ctx.db
			.query('paymentBatchItems')
			.withIndex('by_batch', (q) => q.eq('batchId', batch._id))
			.take(101);
		if (items.some((item) => item.operationId))
			throw new Error('Provider operations already exist.');
		await ctx.db.patch(batch._id, { status: 'cancelled', updatedAt: Date.now() });
		for (const item of items) await ctx.db.patch(item._id, { status: 'cancelled' });
		await auditRun(ctx, batch, 'payout.cancelled');
		return null;
	}
});

export const retryItem = mutation({
	args: {
		organizationId: v.id('organizations'),
		itemId: v.id('paymentBatchItems'),
		idempotencyKey: v.string()
	},
	returns: v.object({ operationId: v.id('operations'), deduplicated: v.boolean() }),
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.itemId);
		assertOrgScoped(item, args.organizationId);
		const batch = await ctx.db.get(item.batchId);
		assertOrgScoped(batch, args.organizationId);
		const { user, wallet } = await requireWalletPermission(
			ctx,
			args.organizationId,
			batch.sourceWalletId,
			'initiate',
			batch.type === 'payroll' ? 'payroll:manage' : 'payout:manage'
		);
		if (!['failed', 'cancelled'].includes(item.status))
			throw new Error('Only a definitively failed or cancelled payout can be retried.');
		const previous = item.operationId ? await ctx.db.get(item.operationId) : null;
		if (!previous || !['failed', 'rejected', 'expired', 'cancelled'].includes(previous.status))
			throw new Error('The previous payout result is not definitively terminal.');
		const previousAttempt = await ctx.db
			.query('providerAttempts')
			.withIndex('by_operation', (q) => q.eq('operationId', previous._id))
			.order('desc')
			.first();
		if (previousAttempt?.status === 'ambiguous')
			throw new Error('Reconcile the ambiguous provider attempt before retrying.');
		await verifyFrozenDestination(ctx, batch, item);
		const policies = await ctx.db
			.query('policies')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
		const path =
			batch.asset === 'USDC' &&
			decimalToUnits(batch.totalAmount, 6) <= decimalToUnits('100', 6) &&
			activeAutomationPolicyAllows({
				policies,
				walletPolicyIds: wallet.policyIds,
				amount: item.amount,
				destination: item.destination,
				asset: batch.asset
			})
				? ('automationSigner' as const)
				: ('privyIntent' as const);
		const retryKey = `retry:${normalizePayoutRunKey(args.idempotencyKey)}`;
		const existing = await ctx.db
			.query('operations')
			.withIndex('by_org_request', (q) =>
				q.eq('organizationId', args.organizationId).eq('requestKey', retryKey)
			)
			.unique();
		if (existing) return { operationId: existing._id, deduplicated: true };
		const operationId = await createPayoutOperation(
			ctx,
			batch,
			item,
			user._id,
			retryKey,
			previous._id,
			path
		);
		await ctx.db.patch(item._id, {
			operationId,
			status: 'queued',
			failureCode: undefined,
			routeReason:
				path === 'automationSigner'
					? 'Retry preflight confirmed the current active wallet policy still permits automation.'
					: 'Retry preflight requires the current Privy quorum approval path.'
		});
		await ctx.db.patch(batch._id, {
			status: 'processing',
			failureCode: undefined,
			updatedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'payout.retry_queued',
			resourceType: 'paymentBatchItem',
			resourceId: item._id,
			correlationId: `batch:${batch._id}`,
			metadata: { operationId, supersedesOperationId: previous._id, sourceWalletId: wallet._id }
		});
		return { operationId, deduplicated: false };
	}
});

export const reconcileItem = mutation({
	args: { organizationId: v.id('organizations'), itemId: v.id('paymentBatchItems') },
	returns: v.object({ scheduled: v.boolean(), reason: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'reconciliation:manage');
		const item = await ctx.db.get(args.itemId);
		assertOrgScoped(item, args.organizationId);
		if (!item.operationId) return { scheduled: false, reason: 'No provider operation exists.' };
		const [intent, action] = await Promise.all([
			ctx.db
				.query('intentSnapshots')
				.withIndex('by_operation', (q) => q.eq('operationId', item.operationId!))
				.first(),
			ctx.db
				.query('walletActionSnapshots')
				.withIndex('by_operation', (q) => q.eq('operationId', item.operationId!))
				.first()
		]);
		if (!intent && !action)
			return {
				scheduled: false,
				reason:
					'No provider reference is available. Keep this payout blocked for manual resolution.'
			};
		await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
			operationId: item.operationId
		});
		return { scheduled: true };
	}
});

async function prepareDraftItems(
	ctx: GenericMutationCtx<DataModel>,
	args: {
		organizationId: Id<'organizations'>;
		type: 'batch' | 'payroll';
		requestKey: string;
		revision: number;
		asset: Asset;
		denominationCurrency?: string;
		items: Array<{
			label?: string;
			recipientId?: Id<'recipients'>;
			userId?: Id<'users'>;
			amount?: string;
			memo?: string;
			sourceRow?: number;
			earnings?: Array<{ label: string; amount: string }>;
			deductions?: Array<{ label: string; amount: string }>;
		}>;
	}
) {
	if (args.type === 'payroll')
		assertUniquePayrollMembers(args.items.map((item) => String(item.userId ?? '')));
	const prepared = [];
	for (const [index, input] of args.items.entries()) {
		if (
			input.sourceRow !== undefined &&
			(!Number.isInteger(input.sourceRow) || input.sourceRow < 2)
		)
			throw new Error('CSV source row must be at least 2.');
		if (args.type === 'batch') {
			if (!input.recipientId) throw new Error('Every payout requires an approved counterparty.');
			const recipient = await ctx.db.get(input.recipientId);
			assertOrgScoped(recipient, args.organizationId);
			if (recipient.status !== 'approved' || !recipient.assets.includes(args.asset))
				throw new Error(`Recipient ${recipient.label} is not approved for ${args.asset}.`);
			const amount = requiredAmount(input.amount, args.asset);
			prepared.push({
				label: input.label?.trim() || recipient.label,
				recipientId: recipient._id,
				destination: recipient.address,
				amount,
				memo: cleanMemo(input.memo),
				destinationKind: 'recipient' as const,
				destinationVersion: recipient.approvedAt ?? recipient._creationTime,
				sourceRow: input.sourceRow,
				requestKey: payoutItemRequestKey('batch', args.requestKey, args.revision, index)
			});
			continue;
		}
		if (!input.userId) throw new Error('Every payroll item requires a member.');
		prepared.push(
			await preparePayrollItem(ctx, args.organizationId, input.userId, input, {
				requestKey: payoutItemRequestKey('payroll', args.requestKey, args.revision, index),
				denominationCurrency: args.denominationCurrency ?? (args.asset === 'ETH' ? 'ETH' : 'USD'),
				asset: args.asset
			})
		);
	}
	return prepared;
}

async function preparePayrollItem(
	ctx: GenericMutationCtx<DataModel>,
	organizationId: Id<'organizations'>,
	userId: Id<'users'>,
	input: {
		amount?: string;
		memo?: string;
		sourceRow?: number;
		earnings?: Array<{ label: string; amount: string }>;
		deductions?: Array<{ label: string; amount: string }>;
	},
	meta: { requestKey: string; denominationCurrency: string; asset: Asset }
) {
	const membership = await ctx.db
		.query('memberships')
		.withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
		.unique();
	if (!membership || membership.status !== 'active')
		throw new Error('Payroll member is not active.');
	const [profile, memberUser, compensation] = await Promise.all([
		ctx.db
			.query('payrollProfiles')
			.withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
			.unique(),
		ctx.db.get(userId),
		ctx.db
			.query('compensationProfiles')
			.withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', userId))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.unique()
	]);
	if (!profile)
		throw new Error(`${memberUser?.name ?? memberUser?.email ?? 'Member'} has no payroll profile.`);
	let personal: Doc<'personalWallets'> | null = null;
	if (profile.destinationKind === 'personal' && profile.personalWalletId) {
		personal = await ctx.db.get(profile.personalWalletId);
		assertOrgScoped(personal, organizationId);
		if (personal.userId !== userId) throw new Error('Personal wallet ownership mismatch.');
	}
	const destination = resolvePayrollDestination({
		eligibility: profile.eligibility,
		destinationKind: profile.destinationKind,
		personalAddress: personal?.address,
		externalAddress: profile.externalAddress,
		externalVerifiedAt: profile.externalVerifiedAt
	});
	const destinationVerifiedAt =
		profile.destinationKind === 'personal' ? personal?.verifiedAt : profile.externalVerifiedAt;
	if (!destinationVerifiedAt || !profile.destinationKind)
		throw new Error('Member salary destination is not verified.');
	const currency = meta.denominationCurrency.trim().toUpperCase();
	const expectedCurrency = meta.asset === 'ETH' ? 'ETH' : 'USD';
	if (currency !== expectedCurrency)
		throw new Error(
			`Base Sepolia ${meta.asset} payroll requires ${expectedCurrency} denomination.`
		);
	if (compensation && compensation.denominationCurrency.toUpperCase() !== currency)
		throw new Error('Compensation currency does not match the payroll run.');
	const earnings = normalizeComponents(
		input.earnings?.length
			? input.earnings
			: [
					{
						label: compensation ? 'Base pay' : 'Pay',
						amount: input.amount ?? compensation?.baseAmount ?? ''
					}
				],
		meta.asset
	);
	const deductions = normalizeComponents(input.deductions ?? [], meta.asset);
	const decimals = assetDecimals(meta.asset);
	const grossUnits = earnings.reduce((sum, row) => sum + decimalToUnits(row.amount, decimals), 0n);
	const deductionUnits = deductions.reduce(
		(sum, row) => sum + decimalToUnits(row.amount, decimals),
		0n
	);
	if (deductionUnits > grossUnits) throw new Error('Payroll deductions cannot exceed earnings.');
	const amount = unitsToDecimal((grossUnits - deductionUnits).toString(), decimals);
	if (amount === '0') throw new Error('Payroll net amount must be greater than zero.');
	return {
		label: memberUser?.name ?? memberUser?.email ?? 'Member',
		userId,
		payrollProfileId: profile._id,
		compensationProfileId: compensation?._id,
		destination,
		amount,
		memo: cleanMemo(input.memo),
		destinationKind: profile.destinationKind,
		destinationVerifiedAt,
		destinationVersion: destinationVerifiedAt,
		sourceRow: input.sourceRow,
		payslipSnapshot: {
			employeeCode: compensation?.employeeCode,
			department: compensation?.department,
			denominationCurrency: currency,
			earnings,
			deductions,
			grossAmount: unitsToDecimal(grossUnits.toString(), decimals),
			deductionAmount: unitsToDecimal(deductionUnits.toString(), decimals),
			netAmount: amount,
			compensationProfileVersion: compensation?.version
		},
		requestKey: meta.requestKey
	};
}

async function verifyFrozenDestination(
	ctx: GenericMutationCtx<DataModel>,
	batch: Doc<'paymentBatches'>,
	item: Doc<'paymentBatchItems'>
) {
	if (batch.type === 'batch') {
		if (!item.recipientId) throw new Error('Payout item has no counterparty.');
		const recipient = await ctx.db.get(item.recipientId);
		assertOrgScoped(recipient, batch.organizationId);
		const version = recipient.approvedAt ?? recipient._creationTime;
		if (
			recipient.status !== 'approved' ||
			!recipient.assets.includes(batch.asset) ||
			recipient.address !== item.destination ||
			version !== item.destinationVersion
		)
			throw new Error(
				`${item.label} changed after the draft was saved. Update the draft before finalizing.`
			);
		return;
	}
	if (!item.userId || !item.payrollProfileId) throw new Error('Payroll snapshot is incomplete.');
	const profile = await ctx.db.get(item.payrollProfileId);
	assertOrgScoped(profile, batch.organizationId);
	let personalAddress: string | undefined;
	let verifiedAt = profile.externalVerifiedAt;
	if (profile.destinationKind === 'personal' && profile.personalWalletId) {
		const personal = await ctx.db.get(profile.personalWalletId);
		assertOrgScoped(personal, batch.organizationId);
		personalAddress = personal.address;
		verifiedAt = personal.verifiedAt;
	}
	const destination = resolvePayrollDestination({
		eligibility: profile.eligibility,
		destinationKind: profile.destinationKind,
		personalAddress,
		externalAddress: profile.externalAddress,
		externalVerifiedAt: profile.externalVerifiedAt
	});
	if (destination !== item.destination || verifiedAt !== item.destinationVersion)
		throw new Error(
			`${item.label}'s payout destination changed. Update the draft before finalizing.`
		);
}

async function dispatchRun(ctx: GenericMutationCtx<DataModel>, batch: Doc<'paymentBatches'>) {
	if (!['approved', 'scheduled'].includes(batch.status))
		throw new Error('Payout run cannot be dispatched from its current state.');
	const items = await ctx.db
		.query('paymentBatchItems')
		.withIndex('by_batch', (q) => q.eq('batchId', batch._id))
		.take(101);
	if (!items.length || items.length > 100 || items.some((item) => item.operationId))
		throw new Error('Payout run has already been dispatched or is invalid.');
	const wallet = await ctx.db.get(batch.sourceWalletId);
	assertOrgScoped(wallet, batch.organizationId);
	const policies = await ctx.db
		.query('policies')
		.withIndex('by_org', (q) => q.eq('organizationId', batch.organizationId))
		.take(100);
	const runAllowsAutomation =
		batch.asset === 'USDC' && decimalToUnits(batch.totalAmount, 6) <= decimalToUnits('100', 6);
	await ctx.db.patch(batch._id, {
		status: 'dispatching',
		dispatchedAt: Date.now(),
		updatedAt: Date.now()
	});
	const operationIds: Id<'operations'>[] = [];
	for (const item of items) {
		const path =
			runAllowsAutomation &&
			activeAutomationPolicyAllows({
				policies,
				walletPolicyIds: wallet.policyIds,
				amount: item.amount,
				destination: item.destination,
				asset: batch.asset
			})
				? ('automationSigner' as const)
				: ('privyIntent' as const);
		const operationId = await createPayoutOperation(
			ctx,
			batch,
			item,
			batch.approvedBy ?? batch.createdBy,
			item.requestKey,
			undefined,
			path
		);
		await ctx.db.patch(item._id, {
			operationId,
			status: 'queued',
			routeReason:
				path === 'automationSigner'
					? 'Active wallet policy permits this frozen destination, item amount, and run total.'
					: 'Privy quorum approval is required because the active wallet policy or aggregate run limit does not permit automation.'
		});
		operationIds.push(operationId);
	}
	await ctx.db.patch(batch._id, {
		status: 'processing',
		submittedAt: Date.now(),
		updatedAt: Date.now()
	});
	return operationIds;
}

async function createPayoutOperation(
	ctx: GenericMutationCtx<DataModel>,
	batch: Doc<'paymentBatches'>,
	item: Doc<'paymentBatchItems'>,
	createdBy: Id<'users'>,
	requestKey: string,
	supersedesOperationId?: Id<'operations'>,
	forcedPath?: 'automationSigner' | 'privyIntent'
) {
	let path = forcedPath;
	if (!path) {
		const previous = item.operationId ? await ctx.db.get(item.operationId) : null;
		path = previous?.approvalPath ?? 'privyIntent';
	}
	const now = Date.now();
	const operationId = await ctx.db.insert('operations', {
		organizationId: batch.organizationId,
		kind: 'payment',
		status: 'queued',
		approvalPath: path,
		asset: batch.asset,
		amount: item.amount,
		destination: item.destination,
		memo: item.memo,
		reference: `${batch.name} · ${item.label}`,
		requestKey,
		createdBy,
		sourceWalletId: batch.sourceWalletId,
		sourceBatchItemId: item._id,
		supersedesOperationId,
		correlationId: `payment:${batch.organizationId}:${requestKey}`,
		createdAt: now,
		updatedAt: now
	});
	const attemptId = await ctx.db.insert('providerAttempts', {
		organizationId: batch.organizationId,
		operationId,
		attemptKey: payoutAttemptKey(operationId),
		providerKind: path === 'automationSigner' ? 'privyAction' : 'privyIntent',
		status: 'pending',
		updatedAt: now
	});
	await ctx.db.patch(operationId, { providerAttemptId: attemptId });
	await ctx.scheduler.runAfter(0, internal.payoutAttemptState.claimAndSchedule, { attemptId });
	return operationId;
}

async function getManagedBatch(
	ctx: GenericMutationCtx<DataModel>,
	organizationId: Id<'organizations'>,
	batchId: Id<'paymentBatches'>,
	permission: 'initiate' | 'manage'
) {
	const batch = await ctx.db.get(batchId);
	assertOrgScoped(batch, organizationId);
	await requireWalletPermission(
		ctx,
		organizationId,
		batch.sourceWalletId,
		permission,
		batch.type === 'payroll' ? 'payroll:manage' : 'payout:manage'
	);
	return batch;
}

async function updateDraftItemStatuses(
	ctx: GenericMutationCtx<DataModel>,
	batchId: Id<'paymentBatches'>,
	status: 'ready' | 'pendingApproval'
) {
	const items = await ctx.db
		.query('paymentBatchItems')
		.withIndex('by_batch', (q) => q.eq('batchId', batchId))
		.take(101);
	for (const item of items) await ctx.db.patch(item._id, { status });
}

async function auditRun(
	ctx: GenericMutationCtx<DataModel>,
	batch: Doc<'paymentBatches'>,
	action: string
) {
	const { user } = await requireMembership(ctx, batch.organizationId);
	await appendAudit(ctx, {
		organizationId: batch.organizationId,
		actorType: 'user',
		actorId: user.privyDid,
		action,
		resourceType: 'paymentBatch',
		resourceId: batch._id,
		correlationId: `batch:${batch._id}`
	});
}

function normalizeComponents(rows: Array<{ label: string; amount: string }>, asset: Asset) {
	return rows.map((row) => {
		const label = row.label.trim();
		if (!label || label.length > 80)
			throw new Error('Payslip component labels must be 1 to 80 characters.');
		return { label, amount: requiredAmount(row.amount, asset) };
	});
}

function requiredAmount(value: string | undefined, asset: Asset) {
	if (!value) throw new Error('Payout amount is required.');
	const amount = normalizeDecimal(value, assetDecimals(asset));
	if (amount === '0') throw new Error('Payout amounts must be greater than zero.');
	return amount;
}

function cleanMemo(value: string | undefined) {
	const memo = value?.trim();
	if (memo && memo.length > 140) throw new Error('Memo must not exceed 140 characters.');
	return memo || undefined;
}

function validatePayPeriod(args: {
	payPeriodStart?: string;
	payPeriodEnd?: string;
	payDate?: string;
	denominationCurrency?: string;
	asset: Asset;
}) {
	for (const [label, value] of [
		['pay period start', args.payPeriodStart],
		['pay period end', args.payPeriodEnd],
		['pay date', args.payDate]
	] as const)
		if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value))
			throw new Error(`Payroll ${label} must use YYYY-MM-DD.`);
	if (args.payPeriodStart! > args.payPeriodEnd!)
		throw new Error('Pay period start must not follow its end.');
	const expectedCurrency = args.asset === 'ETH' ? 'ETH' : 'USD';
	if ((args.denominationCurrency ?? '').trim().toUpperCase() !== expectedCurrency)
		throw new Error(
			`Base Sepolia ${args.asset} payroll requires ${expectedCurrency} denomination.`
		);
}
