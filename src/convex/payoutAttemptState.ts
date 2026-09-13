import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { aggregatePayoutRunStatus, canTransitionProviderAttempt } from '../lib/payout-domain';
import { appendAudit } from './lib/audit';
import type { GenericMutationCtx } from 'convex/server';
import type { DataModel, Id } from './_generated/dataModel';

const CLAIM_LEASE_MS = 5 * 60_000;

const attemptStatus = v.union(
	v.literal('pending'),
	v.literal('claimed'),
	v.literal('submitted'),
	v.literal('ambiguous'),
	v.literal('confirmed'),
	v.literal('failed')
);

export const getBundle = internalQuery({
	args: { attemptId: v.id('providerAttempts') },
	returns: v.any(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) throw new Error('Payout provider attempt not found.');
		const operation = await ctx.db.get(attempt.operationId);
		if (!operation) throw new Error('Payout operation not found.');
		const wallet = operation.sourceWalletId ? await ctx.db.get(operation.sourceWalletId) : null;
		if (!wallet || wallet.organizationId !== operation.organizationId)
			throw new Error('Payout source wallet is invalid.');
		const organization = await ctx.db.get(operation.organizationId);
		if (!organization?.active) throw new Error('Payout organization is inactive.');
		const [principals, policies] = await Promise.all([
			ctx.db
				.query('servicePrincipals')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', operation.organizationId).eq('status', 'active')
				)
				.take(100),
			ctx.db
				.query('policies')
				.withIndex('by_org', (q) => q.eq('organizationId', operation.organizationId))
				.take(100)
		]);
		return { attempt, operation, wallet, organization, principals, policies };
	}
});

export const claimAndSchedule = internalMutation({
	args: { attemptId: v.id('providerAttempts') },
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt || !['pending', 'claimed'].includes(attempt.status)) return false;
		const operation = await ctx.db.get(attempt.operationId);
		if (!operation) return false;
		const now = Date.now();
		if (attempt.status === 'claimed') {
			if (!attempt.claimedAt || now - attempt.claimedAt < CLAIM_LEASE_MS) return false;
			if (attempt.providerStartedAt || operation.status !== 'queued') {
				await markAttemptAmbiguous(ctx, attempt, operation, 'provider_lease_expired_after_start');
				const [intent, action] = await Promise.all([
					ctx.db
						.query('intentSnapshots')
						.withIndex('by_operation', (q) => q.eq('operationId', operation._id))
						.first(),
					ctx.db
						.query('walletActionSnapshots')
						.withIndex('by_operation', (q) => q.eq('operationId', operation._id))
						.first()
				]);
				if (intent || action)
					await ctx.scheduler.runAfter(0, internal.privyActions.reconcileOperation, {
						operationId: operation._id
					});
				return false;
			}
		} else if (operation.status !== 'queued') return false;
		await ctx.db.patch(attempt._id, { status: 'claimed', claimedAt: now, updatedAt: now });
		await ctx.scheduler.runAfter(0, internal.payoutExecution.execute, { attemptId: attempt._id });
		await ctx.scheduler.runAfter(CLAIM_LEASE_MS, internal.payoutAttemptState.claimAndSchedule, {
			attemptId: attempt._id
		});
		return true;
	}
});

export const markProviderStarted = internalMutation({
	args: { attemptId: v.id('providerAttempts') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt || attempt.status !== 'claimed')
			throw new Error('Payout provider attempt is not actively claimed.');
		await ctx.db.patch(attempt._id, { providerStartedAt: Date.now(), updatedAt: Date.now() });
		return null;
	}
});

export const markSubmitted = internalMutation({
	args: { attemptId: v.id('providerAttempts'), providerReferenceId: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) return null;
		assertAttemptTransition(attempt.status, 'submitted');
		const now = Date.now();
		await ctx.db.patch(attempt._id, {
			status: 'submitted',
			providerReferenceId: args.providerReferenceId,
			submittedAt: now,
			updatedAt: now
		});
		return null;
	}
});

export const markAmbiguous = internalMutation({
	args: { attemptId: v.id('providerAttempts'), errorCode: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt || attempt.status === 'ambiguous') return null;
		const operation = await ctx.db.get(attempt.operationId);
		if (!operation) return null;
		await markAttemptAmbiguous(ctx, attempt, operation, args.errorCode);
		return null;
	}
});

export const markFailed = internalMutation({
	args: { attemptId: v.id('providerAttempts'), errorCode: v.string() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt || attempt.status === 'failed' || attempt.status === 'ambiguous') return null;
		assertAttemptTransition(attempt.status, 'failed');
		await ctx.db.patch(attempt._id, {
			status: 'failed',
			errorCode: args.errorCode,
			updatedAt: Date.now()
		});
		const operation = await ctx.db.get(attempt.operationId);
		if (operation) {
			await ctx.db.patch(operation._id, {
				status: 'failed',
				errorCode: args.errorCode,
				updatedAt: Date.now()
			});
			await syncItemAndRun(ctx, operation.sourceBatchItemId, 'failed', args.errorCode);
		}
		return null;
	}
});

export const applyProviderTerminal = internalMutation({
	args: { operationId: v.id('operations'), succeeded: v.boolean() },
	returns: v.null(),
	handler: async (ctx, args) => {
		const attempt = await ctx.db
			.query('providerAttempts')
			.withIndex('by_operation', (q) => q.eq('operationId', args.operationId))
			.order('desc')
			.first();
		if (!attempt || attempt.status === 'confirmed' || attempt.status === 'failed') return null;
		const next = args.succeeded ? ('confirmed' as const) : ('failed' as const);
		if (canTransitionProviderAttempt(attempt.status, next))
			await ctx.db.patch(attempt._id, { status: next, updatedAt: Date.now() });
		return null;
	}
});

async function syncItemAndRun(
	ctx: GenericMutationCtx<DataModel>,
	itemId: Id<'paymentBatchItems'> | undefined,
	status: 'ambiguous' | 'failed',
	failureCode: string
) {
	if (!itemId) return;
	const item = await ctx.db.get(itemId);
	if (!item) return;
	await ctx.db.patch(item._id, { status, failureCode });
	const items = await ctx.db
		.query('paymentBatchItems')
		.withIndex('by_batch', (q) => q.eq('batchId', item.batchId))
		.take(100);
	const statuses = items.map((candidate) =>
		candidate._id === item._id ? status : candidate.status
	);
	await ctx.db.patch(item.batchId, {
		status: aggregatePayoutRunStatus(statuses),
		failureCode: status === 'ambiguous' ? failureCode : undefined,
		updatedAt: Date.now()
	});
}

function assertAttemptTransition(
	from: Parameters<typeof canTransitionProviderAttempt>[0],
	to: Parameters<typeof canTransitionProviderAttempt>[1]
) {
	if (!canTransitionProviderAttempt(from, to))
		throw new Error(`Invalid payout provider attempt transition: ${from} -> ${to}.`);
}

async function markAttemptAmbiguous(
	ctx: GenericMutationCtx<DataModel>,
	attempt: import('./_generated/dataModel').Doc<'providerAttempts'>,
	operation: import('./_generated/dataModel').Doc<'operations'>,
	errorCode: string
) {
	assertAttemptTransition(attempt.status, 'ambiguous');
	const now = Date.now();
	await ctx.db.patch(attempt._id, { status: 'ambiguous', errorCode, updatedAt: now });
	await ctx.db.patch(operation._id, { errorCode, updatedAt: now });
	await syncItemAndRun(ctx, operation.sourceBatchItemId, 'ambiguous', errorCode);
	await appendAudit(ctx, {
		organizationId: operation.organizationId,
		actorType: 'system',
		actorId: 'convex',
		action: 'payout.provider_result_ambiguous',
		resourceType: 'operation',
		resourceId: operation._id,
		correlationId: operation.correlationId,
		metadata: { attemptKey: attempt.attemptKey, errorCode }
	});
}

export { attemptStatus };
