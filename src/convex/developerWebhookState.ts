import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

const retryDelays = [
	60_000,
	5 * 60_000,
	30 * 60_000,
	2 * 60 * 60_000,
	8 * 60 * 60_000,
	24 * 60 * 60_000
];
const CLAIM_LEASE_MS = 2 * 60_000;

export const claim = internalMutation({
	args: { deliveryId: v.id('developerWebhookDeliveries') },
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		const delivery = await ctx.db.get(args.deliveryId);
		if (!delivery || !['pending', 'retrying'].includes(delivery.status)) return null;
		const now = Date.now();
		if (delivery.nextAttemptAt && delivery.nextAttemptAt > now) return null;
		const endpoint = await ctx.db.get(delivery.endpointId);
		const event = await ctx.db.get(delivery.eventId);
		if (
			!endpoint ||
			!event ||
			endpoint.organizationId !== delivery.organizationId ||
			event.organizationId !== delivery.organizationId ||
			endpoint.status !== 'active'
		) {
			await ctx.db.patch(delivery._id, {
				status: 'failed',
				errorCode: 'delivery_dependency_unavailable',
				completedAt: now,
				updatedAt: now
			});
			return null;
		}
		await ctx.db.patch(delivery._id, {
			status: 'claimed',
			claimedAt: now,
			nextAttemptAt: undefined,
			updatedAt: now
		});
		return { delivery, endpoint, event, leaseClaimedAt: now };
	}
});

export const complete = internalMutation({
	args: {
		deliveryId: v.id('developerWebhookDeliveries'),
		leaseClaimedAt: v.number(),
		succeeded: v.boolean(),
		responseStatus: v.optional(v.number()),
		errorCode: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const delivery = await ctx.db.get(args.deliveryId);
		if (!delivery || delivery.status !== 'claimed' || delivery.claimedAt !== args.leaseClaimedAt)
			return null;
		const endpoint = await ctx.db.get(delivery.endpointId);
		const now = Date.now();
		if (args.succeeded) {
			await ctx.db.patch(delivery._id, {
				status: 'succeeded',
				responseStatus: args.responseStatus,
				errorCode: undefined,
				completedAt: now,
				updatedAt: now
			});
			if (endpoint && endpoint.organizationId === delivery.organizationId)
				await ctx.db.patch(endpoint._id, { lastSuccessAt: now, updatedAt: now });
			return null;
		}
		if (endpoint && endpoint.organizationId === delivery.organizationId)
			await ctx.db.patch(endpoint._id, { lastFailureAt: now, updatedAt: now });
		if (delivery.attempt >= 8) {
			await ctx.db.patch(delivery._id, {
				status: 'failed',
				responseStatus: args.responseStatus,
				errorCode: args.errorCode,
				completedAt: now,
				updatedAt: now
			});
			if (endpoint && endpoint.organizationId === delivery.organizationId)
				await ctx.db.patch(endpoint._id, { status: 'paused', updatedAt: now });
			return null;
		}
		const nextAttemptAt =
			now + (retryDelays[Math.min(delivery.attempt - 1, retryDelays.length - 1)] ?? 86_400_000);
		await ctx.db.patch(delivery._id, {
			status: 'retrying',
			responseStatus: args.responseStatus,
			errorCode: args.errorCode,
			attempt: delivery.attempt + 1,
			deliveryKey: `${delivery.endpointId}:${delivery.eventId}:${delivery.attempt + 1}`,
			nextAttemptAt,
			updatedAt: now
		});
		await ctx.scheduler.runAt(nextAttemptAt, internal.developerWebhookActions.deliver, {
			deliveryId: delivery._id
		});
		return null;
	}
});

export const recoverStaleClaims = internalMutation({
	args: {},
	returns: v.object({ recovered: v.number(), failed: v.number() }),
	handler: async (ctx) => {
		const now = Date.now();
		const claimed = await ctx.db
			.query('developerWebhookDeliveries')
			.withIndex('by_status_next', (q) => q.eq('status', 'claimed'))
			.take(100);
		let recovered = 0;
		let failed = 0;
		for (const delivery of claimed) {
			if (!delivery.claimedAt || delivery.claimedAt > now - CLAIM_LEASE_MS) continue;
			const endpoint = await ctx.db.get(delivery.endpointId);
			if (
				delivery.attempt >= 8 ||
				!endpoint ||
				endpoint.organizationId !== delivery.organizationId ||
				endpoint.status !== 'active'
			) {
				await ctx.db.patch(delivery._id, {
					status: 'failed',
					errorCode: 'delivery_lease_expired',
					claimedAt: undefined,
					completedAt: now,
					updatedAt: now
				});
				if (endpoint?.organizationId === delivery.organizationId && endpoint.status === 'active')
					await ctx.db.patch(endpoint._id, {
						status: 'paused',
						lastFailureAt: now,
						updatedAt: now
					});
				failed += 1;
				continue;
			}
			const attempt = delivery.attempt + 1;
			await ctx.db.patch(delivery._id, {
				status: 'retrying',
				attempt,
				deliveryKey: `${delivery.endpointId}:${delivery.eventId}:${attempt}`,
				errorCode: 'delivery_lease_expired',
				claimedAt: undefined,
				nextAttemptAt: now,
				updatedAt: now
			});
			await ctx.scheduler.runAfter(0, internal.developerWebhookActions.deliver, {
				deliveryId: delivery._id
			});
			recovered += 1;
		}
		return { recovered, failed };
	}
});
