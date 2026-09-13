import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireMembership, assertOrgScoped } from './lib/authz';
import { appendAudit } from './lib/audit';
import { validateWebhookEndpointUrl } from '../lib/developer-api';
import { DEVELOPER_EVENT_TYPES, emitDeveloperEvent } from './developerEvents';

function eventTypes(values: string[]): string[] {
	const allowed = new Set<string>(['*', ...DEVELOPER_EVENT_TYPES]);
	const unique = [...new Set(values.map((value) => value.trim()))].sort();
	if (unique.length === 0) throw new Error('Select at least one webhook event.');
	for (const value of unique)
		if (!allowed.has(value)) throw new Error(`Unsupported event: ${value}`);
	return unique;
}

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'org:manage');
		const endpoints = await ctx.db
			.query('developerWebhookEndpoints')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(50);
		return Promise.all(
			endpoints.map(async (endpoint) => ({
				...endpoint,
				deliveries: await ctx.db
					.query('developerWebhookDeliveries')
					.withIndex('by_endpoint_time', (q) => q.eq('endpointId', endpoint._id))
					.order('desc')
					.take(10)
			}))
		);
	}
});

export const create = mutation({
	args: { organizationId: v.id('organizations'), url: v.string(), eventTypes: v.array(v.string()) },
	returns: v.id('developerWebhookEndpoints'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const url = validateWebhookEndpointUrl(args.url);
		const existing = await ctx.db
			.query('developerWebhookEndpoints')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.filter((q) => q.eq(q.field('url'), url))
			.first();
		if (existing && existing.status !== 'revoked')
			throw new Error('Webhook endpoint already exists.');
		const now = Date.now();
		const endpointId = await ctx.db.insert('developerWebhookEndpoints', {
			organizationId: args.organizationId,
			url,
			eventTypes: eventTypes(args.eventTypes),
			schemaVersion: 1,
			status: 'active',
			createdBy: user._id,
			createdAt: now,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'developer.webhook_created',
			resourceType: 'developerWebhookEndpoint',
			resourceId: endpointId,
			correlationId: `developer-webhook:${endpointId}`,
			metadata: { url, eventTypes: args.eventTypes }
		});
		return endpointId;
	}
});

export const setStatus = mutation({
	args: {
		organizationId: v.id('organizations'),
		endpointId: v.id('developerWebhookEndpoints'),
		status: v.union(v.literal('active'), v.literal('paused'), v.literal('revoked'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const endpoint = await ctx.db.get(args.endpointId);
		assertOrgScoped(endpoint, args.organizationId);
		if (endpoint.status === 'revoked' && args.status !== 'revoked')
			throw new Error('Revoked webhook endpoints cannot be reactivated.');
		await ctx.db.patch(endpoint._id, { status: args.status, updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: `developer.webhook_${args.status}`,
			resourceType: 'developerWebhookEndpoint',
			resourceId: endpoint._id,
			correlationId: `developer-webhook:${endpoint._id}`
		});
		return null;
	}
});

export const sendTest = mutation({
	args: { organizationId: v.id('organizations'), endpointId: v.id('developerWebhookEndpoints') },
	returns: v.id('developerEvents'),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'org:manage');
		const endpoint = await ctx.db.get(args.endpointId);
		assertOrgScoped(endpoint, args.organizationId);
		if (endpoint.status !== 'active') throw new Error('Webhook endpoint is not active.');
		const eventId = await emitDeveloperEvent(ctx, {
			organizationId: args.organizationId,
			eventType: 'webhook.test',
			aggregateType: 'webhookEndpoint',
			aggregateId: endpoint._id,
			data: { network: 'eip155:84532' },
			endpointId: endpoint._id
		});
		return eventId;
	}
});

export const replay = mutation({
	args: { organizationId: v.id('organizations'), deliveryId: v.id('developerWebhookDeliveries') },
	returns: v.id('developerWebhookDeliveries'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'org:manage');
		const delivery = await ctx.db.get(args.deliveryId);
		assertOrgScoped(delivery, args.organizationId);
		const endpoint = await ctx.db.get(delivery.endpointId);
		assertOrgScoped(endpoint, args.organizationId);
		if (endpoint.status !== 'active') throw new Error('Webhook endpoint is not active.');
		const prior = await ctx.db
			.query('developerWebhookDeliveries')
			.withIndex('by_endpoint_time', (q) => q.eq('endpointId', endpoint._id))
			.filter((q) => q.eq(q.field('eventId'), delivery.eventId))
			.order('desc')
			.take(100);
		const attempt = Math.max(...prior.map((item) => item.attempt), 0) + 1;
		const now = Date.now();
		const replayId = await ctx.db.insert('developerWebhookDeliveries', {
			organizationId: args.organizationId,
			endpointId: endpoint._id,
			eventId: delivery.eventId,
			attempt,
			status: 'pending',
			deliveryKey: `${endpoint._id}:${delivery.eventId}:${attempt}`,
			createdAt: now,
			updatedAt: now
		});
		await ctx.scheduler.runAfter(0, internal.developerWebhookActions.deliver, {
			deliveryId: replayId
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'developer.webhook_replayed',
			resourceType: 'developerWebhookDelivery',
			resourceId: replayId,
			correlationId: `developer-event:${delivery.eventId}`,
			metadata: { priorDeliveryId: delivery._id, attempt }
		});
		return replayId;
	}
});
