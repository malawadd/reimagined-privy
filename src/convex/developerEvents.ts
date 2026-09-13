import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import type { GenericMutationCtx } from 'convex/server';
import { internal } from './_generated/api';
import { requireMembership } from './lib/authz';
import { redactAuditMetadata } from '../lib/audit';
import type { DataModel, Id } from './_generated/dataModel';

export const DEVELOPER_EVENT_TYPES = [
	'operation.created',
	'operation.pending_approval',
	'operation.executing',
	'operation.succeeded',
	'operation.failed',
	'webhook.test'
] as const;

export type DeveloperEventType = (typeof DEVELOPER_EVENT_TYPES)[number];

export async function emitDeveloperEvent(
	ctx: GenericMutationCtx<DataModel>,
	input: {
		organizationId: Id<'organizations'>;
		eventType: DeveloperEventType;
		aggregateType: string;
		aggregateId: string;
		data: unknown;
		endpointId?: Id<'developerWebhookEndpoints'>;
	}
) {
	const safeData = redactAuditMetadata(input.data ?? {});
	if (JSON.stringify(safeData).length > 32_000)
		throw new Error('Developer event payload is too large.');
	const previous = await ctx.db
		.query('developerEvents')
		.withIndex('by_aggregate_sequence', (q) =>
			q
				.eq('organizationId', input.organizationId)
				.eq('aggregateType', input.aggregateType)
				.eq('aggregateId', input.aggregateId)
		)
		.order('desc')
		.first();
	const now = Date.now();
	const eventId = await ctx.db.insert('developerEvents', {
		organizationId: input.organizationId,
		eventType: input.eventType,
		aggregateType: input.aggregateType,
		aggregateId: input.aggregateId,
		aggregateSequence: (previous?.aggregateSequence ?? 0) + 1,
		schemaVersion: 1,
		data: safeData,
		occurredAt: now
	});
	const endpoints = input.endpointId
		? [await ctx.db.get(input.endpointId)]
		: await ctx.db
				.query('developerWebhookEndpoints')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', input.organizationId).eq('status', 'active')
				)
				.take(100);
	for (const endpoint of endpoints) {
		if (
			!endpoint ||
			endpoint.organizationId !== input.organizationId ||
			endpoint.status !== 'active' ||
			(!endpoint.eventTypes.includes('*') && !endpoint.eventTypes.includes(input.eventType))
		)
			continue;
		const deliveryKey = `${endpoint._id}:${eventId}:1`;
		const deliveryId = await ctx.db.insert('developerWebhookDeliveries', {
			organizationId: input.organizationId,
			endpointId: endpoint._id,
			eventId,
			attempt: 1,
			status: 'pending',
			deliveryKey,
			createdAt: now,
			updatedAt: now
		});
		await ctx.scheduler.runAfter(0, internal.developerWebhookActions.deliver, {
			deliveryId
		});
	}
	return eventId;
}

export const emit = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		eventType: v.union(...DEVELOPER_EVENT_TYPES.map((type) => v.literal(type))),
		aggregateType: v.string(),
		aggregateId: v.string(),
		data: v.any(),
		endpointId: v.optional(v.id('developerWebhookEndpoints'))
	},
	returns: v.id('developerEvents'),
	handler: emitDeveloperEvent
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'org:manage');
		return ctx.db
			.query('developerEvents')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
	}
});
