import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server';
import { internal } from './_generated/api';
import {
	decimalToUnits,
	normalizeDecimal,
	normalizeEvmAddress,
	unitsToDecimal
} from '../lib/domain';
import { redactAuditMetadata } from '../lib/audit';
import { appendAudit } from './lib/audit';
import { emitDeveloperEvent } from './developerEvents';
import type { DataModel, Doc, Id } from './_generated/dataModel';
import { payoutAttemptKey } from '../lib/payout-domain';
import { validateWebhookEndpointUrl } from '../lib/developer-api';
import { DEVELOPER_EVENT_TYPES } from './developerEvents';

const REPORT_LIMITS = {
	ledgerEntries: 1_000,
	operations: 500,
	invoices: 500,
	payables: 500
} as const;
const OPEN_PAYABLE_STATUSES = new Set([
	'draft',
	'pendingApproval',
	'approved',
	'paymentQueued',
	'failed'
]);

export const lookupCredential = internalQuery({
	args: { keyId: v.string() },
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		const credential = await ctx.db
			.query('developerCredentials')
			.withIndex('by_key_id', (q) => q.eq('keyId', args.keyId))
			.unique();
		if (!credential) return null;
		const account = await ctx.db.get(credential.serviceAccountId);
		const organization = account ? await ctx.db.get(account.organizationId) : null;
		if (!account || !organization || credential.organizationId !== account.organizationId)
			return null;
		return { credential, account, organization };
	}
});

export const claimRequest = internalMutation({
	args: {
		keyId: v.string(),
		nonceHash: v.string(),
		bucket: v.union(v.literal('read'), v.literal('write'))
	},
	returns: v.any(),
	handler: async (ctx, args) => {
		const credential = await ctx.db
			.query('developerCredentials')
			.withIndex('by_key_id', (q) => q.eq('keyId', args.keyId))
			.unique();
		if (!credential || credential.status !== 'active') throw new Error('credential_inactive');
		const account = await ctx.db.get(credential.serviceAccountId);
		if (
			!account ||
			account.status !== 'active' ||
			account.organizationId !== credential.organizationId
		)
			throw new Error('credential_inactive');
		const organization = await ctx.db.get(account.organizationId);
		const now = Date.now();
		if (!organization?.active) throw new Error('organization_inactive');
		if (
			(credential.expiresAt && credential.expiresAt <= now) ||
			(account.expiresAt && account.expiresAt <= now)
		)
			throw new Error('credential_expired');
		const replay = await ctx.db
			.query('developerApiNonces')
			.withIndex('by_credential_nonce', (q) =>
				q.eq('credentialId', credential._id).eq('nonceHash', args.nonceHash)
			)
			.unique();
		if (replay) throw new Error('request_replayed');
		const windowStartedAt = Math.floor(now / 60_000) * 60_000;
		const window = await ctx.db
			.query('developerApiRateLimits')
			.withIndex('by_credential_bucket_window', (q) =>
				q
					.eq('credentialId', credential._id)
					.eq('bucket', args.bucket)
					.eq('windowStartedAt', windowStartedAt)
			)
			.unique();
		const limit = args.bucket === 'write' ? 30 : 120;
		if (window && window.count >= limit) throw new Error('rate_limit_exceeded');
		const used = (window?.count ?? 0) + 1;
		if (window) await ctx.db.patch(window._id, { count: used, updatedAt: now });
		else
			await ctx.db.insert('developerApiRateLimits', {
				organizationId: account.organizationId,
				credentialId: credential._id,
				bucket: args.bucket,
				windowStartedAt,
				count: 1,
				updatedAt: now
			});
		await ctx.db.insert('developerApiNonces', {
			organizationId: account.organizationId,
			credentialId: credential._id,
			nonceHash: args.nonceHash,
			expiresAt: now + 10 * 60_000,
			createdAt: now
		});
		await ctx.db.patch(credential._id, { lastUsedAt: now });
		await ctx.db.patch(account._id, { lastUsedAt: now });
		return {
			credential,
			account,
			organization,
			rateLimit: {
				limit,
				remaining: Math.max(0, limit - used),
				resetAt: windowStartedAt + 60_000
			}
		};
	}
});

export const getOrganization = internalQuery({
	args: { organizationId: v.id('organizations') },
	returns: v.any(),
	handler: async (ctx, args) => {
		const organization = await ctx.db.get(args.organizationId);
		if (!organization?.active) throw new Error('organization_not_found');
		return { id: organization._id, name: organization.name, slug: organization.slug, active: true };
	}
});

export const listWallets = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const allowed = new Set(args.walletIds);
		const wallets = await ctx.db
			.query('wallets')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(250);
		return wallets
			.filter((wallet) => allowed.size === 0 || allowed.has(wallet._id))
			.map((wallet) => ({
				id: wallet._id,
				name: wallet.name,
				address: wallet.address,
				chain: 'base_sepolia',
				chainId: wallet.chainId,
				purpose: wallet.purpose ?? null,
				syncedAt: new Date(wallet.syncedAt).toISOString()
			}));
	}
});

export const listOperations = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const allowed = new Set(args.walletIds);
		const operations = await ctx.db
			.query('operations')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return operations
			.filter(
				(operation) =>
					!operation.sourceWalletId || allowed.size === 0 || allowed.has(operation.sourceWalletId)
			)
			.map(publicOperation);
	}
});

export const getOperation = internalQuery({
	args: {
		organizationId: v.id('organizations'),
		operationId: v.string(),
		walletIds: v.array(v.id('wallets'))
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		const operationId = ctx.db.normalizeId('operations', args.operationId);
		if (!operationId) return null;
		const operation = await ctx.db.get(operationId);
		if (!operation || operation.organizationId !== args.organizationId) return null;
		if (
			operation.sourceWalletId &&
			args.walletIds.length &&
			!args.walletIds.includes(operation.sourceWalletId)
		)
			return null;
		return publicOperation(operation);
	}
});

export const listInvoices = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const allowed = new Set(args.walletIds);
		const invoices = await ctx.db
			.query('invoices')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return invoices
			.filter((invoice) => allowed.size === 0 || allowed.has(invoice.treasuryWalletId))
			.map((invoice) => ({
				id: invoice._id,
				invoiceNumber: invoice.invoiceNumber,
				customerName: invoice.customerName,
				asset: invoice.asset,
				amount: invoice.amount,
				paidAmount: invoice.paidAmount,
				status: invoice.status,
				dueAt: new Date(invoice.dueAt).toISOString(),
				treasuryWalletId: invoice.treasuryWalletId,
				collectionWalletId: invoice.collectionWalletId ?? null,
				createdAt: new Date(invoice.createdAt).toISOString(),
				updatedAt: new Date(invoice.updatedAt).toISOString()
			}));
	}
});

export const listBatches = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => listPublicBatches(ctx, args, 'batch')
});

export const listPayroll = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => listPublicBatches(ctx, args, 'payroll')
});

export const listPayouts = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const allowed = new Set(args.walletIds);
		const payables = await ctx.db
			.query('payables')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		const result = [];
		for (const payable of payables) {
			const sourceWalletId = await payableSourceWalletId(ctx, payable);
			if (allowed.size > 0 && (!sourceWalletId || !allowed.has(sourceWalletId))) continue;
			result.push({
				id: payable._id,
				type: payable.type,
				reference: payable.reference,
				payeeName: payable.payeeName,
				destination: payable.destination,
				asset: payable.asset,
				amount: payable.amount,
				status: payable.status,
				operationId: payable.operationId ?? null,
				dueAt: new Date(payable.dueAt).toISOString(),
				createdAt: new Date(payable.createdAt).toISOString(),
				updatedAt: new Date(payable.updatedAt).toISOString()
			});
		}
		return result;
	}
});

export const getReport = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.any(),
	handler: async (ctx, args) => {
		const allowed = new Set(args.walletIds);
		const from = Date.now() - 30 * 86_400_000;
		const to = Date.now();
		const [entryRows, operationRows, invoiceRows, payableRows] = await Promise.all([
			ctx.db
				.query('ledgerEntries')
				.withIndex('by_org_time', (q) =>
					q.eq('organizationId', args.organizationId).gte('occurredAt', from).lte('occurredAt', to)
				)
				.take(REPORT_LIMITS.ledgerEntries + 1),
			ctx.db
				.query('operations')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(REPORT_LIMITS.operations + 1),
			ctx.db
				.query('invoices')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(REPORT_LIMITS.invoices + 1),
			ctx.db
				.query('payables')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(REPORT_LIMITS.payables + 1)
		]);
		const entries = entryRows.slice(0, REPORT_LIMITS.ledgerEntries);
		const operations = operationRows.slice(0, REPORT_LIMITS.operations);
		const invoices = invoiceRows.slice(0, REPORT_LIMITS.invoices);
		const payables = payableRows.slice(0, REPORT_LIMITS.payables);
		const truncatedSources = (
			Object.entries({
				ledgerEntries: entryRows.length > REPORT_LIMITS.ledgerEntries,
				operations: operationRows.length > REPORT_LIMITS.operations,
				invoices: invoiceRows.length > REPORT_LIMITS.invoices,
				payables: payableRows.length > REPORT_LIMITS.payables
			}) as Array<[keyof typeof REPORT_LIMITS, boolean]>
		)
			.filter(([, truncated]) => truncated)
			.map(([source]) => source);
		const visibleOperations = operations.filter(
			(operation) =>
				(allowed.size === 0 ||
					(operation.sourceWalletId && allowed.has(operation.sourceWalletId))) &&
				operation.createdAt >= from &&
				operation.createdAt <= to
		);
		const movement = {
			ETH: { inflow: 0n, outflow: 0n },
			USDC: { inflow: 0n, outflow: 0n }
		};
		for (const entry of entries) {
			if (!entry.account.startsWith('Wallet:')) continue;
			const walletId = entry.account.slice('Wallet:'.length);
			if (allowed.size > 0 && !allowed.has(walletId as Id<'wallets'>)) continue;
			const units = decimalToUnits(entry.amount, entry.asset === 'USDC' ? 6 : 18);
			movement[entry.asset][entry.direction === 'debit' ? 'inflow' : 'outflow'] += units;
		}
		let receivables = 0n;
		for (const invoice of invoices) {
			if (allowed.size > 0 && !allowed.has(invoice.treasuryWalletId)) continue;
			if (invoice.status === 'void' || invoice.status === 'failed') continue;
			const remaining = decimalToUnits(invoice.amount, 6) - decimalToUnits(invoice.paidAmount, 6);
			if (remaining > 0n) receivables += remaining;
		}
		let openPayables = 0n;
		for (const payable of payables) {
			const sourceWalletId = await payableSourceWalletId(ctx, payable);
			if (allowed.size > 0 && (!sourceWalletId || !allowed.has(sourceWalletId))) continue;
			if (OPEN_PAYABLE_STATUSES.has(payable.status))
				openPayables += decimalToUnits(payable.amount, 6);
		}
		return {
			period: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), days: 30 },
			inflows: [
				{ asset: 'ETH', amount: unitsToDecimal(movement.ETH.inflow.toString(), 18) },
				{ asset: 'USDC', amount: unitsToDecimal(movement.USDC.inflow.toString(), 6) }
			],
			outflows: [
				{ asset: 'ETH', amount: unitsToDecimal(movement.ETH.outflow.toString(), 18) },
				{ asset: 'USDC', amount: unitsToDecimal(movement.USDC.outflow.toString(), 6) }
			],
			outstandingReceivablesUsdc: unitsToDecimal(receivables.toString(), 6),
			openPayablesUsdc: unitsToDecimal(openPayables.toString(), 6),
			operationCount: visibleOperations.length,
			succeededCount: visibleOperations.filter((operation) => operation.status === 'succeeded')
				.length,
			pendingCount: visibleOperations.filter((operation) =>
				['queued', 'pendingApproval', 'executing', 'pendingConfirmation'].includes(operation.status)
			).length,
			failedCount: visibleOperations.filter((operation) =>
				['failed', 'rejected', 'expired', 'cancelled'].includes(operation.status)
			).length,
			completeness: {
				complete: truncatedSources.length === 0,
				truncated: truncatedSources.length > 0,
				truncatedSources,
				walletRestrictionApplied: allowed.size > 0,
				sourceRows: {
					ledgerEntries: entries.length,
					operations: operations.length,
					invoices: invoices.length,
					payables: payables.length
				},
				sourceLimits: REPORT_LIMITS
			}
		};
	}
});

export const listAudit = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const allowed = new Set(args.walletIds);
		const events = await ctx.db
			.query('auditEvents')
			.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(250);
		const visible = [];
		for (const event of events) {
			if (allowed.size > 0 && !(await auditEventVisibleToWallets(ctx, event, allowed))) continue;
			visible.push(event);
			if (visible.length === 100) break;
		}
		return visible.map((event) => ({
			id: event._id,
			actorType: event.actorType,
			actorId: event.actorId,
			action: event.action,
			resourceType: event.resourceType,
			resourceId: event.resourceId,
			correlationId: event.correlationId,
			transactionHash: event.transactionHash ?? null,
			metadata: redactAuditMetadata(event.metadata),
			occurredAt: new Date(event.occurredAt).toISOString()
		}));
	}
});

export const listWebhookDeliveries = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		void args.walletIds;
		const endpoints = await ctx.db
			.query('developerWebhookEndpoints')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.take(100);
		const result = [];
		for (const endpoint of endpoints) {
			const deliveries = await ctx.db
				.query('developerWebhookDeliveries')
				.withIndex('by_endpoint_time', (q) => q.eq('endpointId', endpoint._id))
				.order('desc')
				.take(50);
			for (const delivery of deliveries) {
				const event = await ctx.db.get(delivery.eventId);
				if (!event || event.organizationId !== args.organizationId) continue;
				result.push({
					id: delivery._id,
					endpointId: endpoint._id,
					eventId: event._id,
					eventType: event.eventType,
					attempt: delivery.attempt,
					status: delivery.status,
					responseStatus: delivery.responseStatus ?? null,
					errorCode: delivery.errorCode ?? null,
					nextAttemptAt: delivery.nextAttemptAt
						? new Date(delivery.nextAttemptAt).toISOString()
						: null,
					createdAt: new Date(delivery.createdAt).toISOString(),
					updatedAt: new Date(delivery.updatedAt).toISOString()
				});
			}
		}
		return result
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			.slice(0, 100);
	}
});

export const listWebhookEndpoints = internalQuery({
	args: { organizationId: v.id('organizations'), walletIds: v.array(v.id('wallets')) },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		void args.walletIds;
		const endpoints = await ctx.db
			.query('developerWebhookEndpoints')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(100);
		return endpoints.map((endpoint) => ({
			id: endpoint._id,
			url: endpoint.url,
			eventTypes: endpoint.eventTypes,
			schemaVersion: endpoint.schemaVersion,
			status: endpoint.status,
			lastSuccessAt: endpoint.lastSuccessAt ? new Date(endpoint.lastSuccessAt).toISOString() : null,
			lastFailureAt: endpoint.lastFailureAt ? new Date(endpoint.lastFailureAt).toISOString() : null,
			createdAt: new Date(endpoint.createdAt).toISOString(),
			updatedAt: new Date(endpoint.updatedAt).toISOString()
		}));
	}
});

export const createWebhookEndpoint = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		requestId: v.string(),
		idempotencyKey: v.string(),
		requestFingerprint: v.string(),
		url: v.string(),
		eventTypes: v.array(v.string())
	},
	returns: v.object({ endpoint: v.any(), deduplicated: v.boolean() }),
	handler: async (ctx, args) => {
		const account = await requireDeveloperWebhookAccount(
			ctx,
			args.organizationId,
			args.serviceAccountId
		);
		const route = '/v1/webhook-endpoints';
		const prior = await findApiIdempotency(ctx, {
			organizationId: args.organizationId,
			serviceAccountId: account._id,
			route,
			key: args.idempotencyKey
		});
		if (prior) {
			if (prior.requestFingerprint !== args.requestFingerprint)
				throw new Error('idempotency_key_reused');
			if (!prior.resourceId) throw new Error('idempotency_request_in_progress');
			const endpointId = ctx.db.normalizeId('developerWebhookEndpoints', prior.resourceId);
			const endpoint = endpointId ? await ctx.db.get(endpointId) : null;
			if (!endpoint || endpoint.organizationId !== args.organizationId)
				throw new Error('idempotency_resource_missing');
			return { endpoint: publicWebhookEndpoint(endpoint), deduplicated: true };
		}
		const url = validateWebhookEndpointUrl(args.url);
		const allowed = new Set<string>(['*', ...DEVELOPER_EVENT_TYPES]);
		const eventTypes = [...new Set(args.eventTypes.map((value) => value.trim()))].sort();
		if (!eventTypes.length || eventTypes.some((value) => !allowed.has(value)))
			throw new Error('invalid_webhook_events');
		const duplicate = await ctx.db
			.query('developerWebhookEndpoints')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.filter((q) => q.and(q.eq(q.field('url'), url), q.neq(q.field('status'), 'revoked')))
			.first();
		if (duplicate) throw new Error('webhook_endpoint_exists');
		const now = Date.now();
		const idempotencyId = await ctx.db.insert('developerApiIdempotency', {
			organizationId: args.organizationId,
			serviceAccountId: account._id,
			method: 'POST',
			route,
			key: args.idempotencyKey,
			requestFingerprint: args.requestFingerprint,
			status: 'in_progress',
			requestId: args.requestId,
			createdAt: now,
			updatedAt: now,
			expiresAt: now + 24 * 60 * 60_000
		});
		const endpointId = await ctx.db.insert('developerWebhookEndpoints', {
			organizationId: args.organizationId,
			url,
			eventTypes,
			schemaVersion: 1,
			status: 'active',
			createdByServiceAccount: account._id,
			createdAt: now,
			updatedAt: now
		});
		const endpoint = await ctx.db.get(endpointId);
		if (!endpoint) throw new Error('webhook_endpoint_insert_failed');
		const response = publicWebhookEndpoint(endpoint);
		await ctx.db.patch(idempotencyId, {
			status: 'completed',
			responseStatus: 201,
			responseBody: response,
			resourceId: String(endpointId),
			updatedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'servicePrincipal',
			actorId: String(account._id),
			action: 'developer.webhook_created',
			resourceType: 'developerWebhookEndpoint',
			resourceId: endpointId,
			correlationId: `developer-webhook:${endpointId}`,
			metadata: { requestId: args.requestId, url, eventTypes }
		});
		return { endpoint: response, deduplicated: false };
	}
});

export const replayWebhookDelivery = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		requestId: v.string(),
		idempotencyKey: v.string(),
		requestFingerprint: v.string(),
		deliveryId: v.string()
	},
	returns: v.object({ delivery: v.any(), deduplicated: v.boolean() }),
	handler: async (ctx, args) => {
		const account = await requireDeveloperWebhookAccount(
			ctx,
			args.organizationId,
			args.serviceAccountId
		);
		const route = '/v1/webhook-deliveries/{deliveryId}/replay';
		const prior = await findApiIdempotency(ctx, {
			organizationId: args.organizationId,
			serviceAccountId: account._id,
			route,
			key: args.idempotencyKey
		});
		if (prior) {
			if (prior.requestFingerprint !== args.requestFingerprint)
				throw new Error('idempotency_key_reused');
			if (!prior.resourceId) throw new Error('idempotency_request_in_progress');
			const replayId = ctx.db.normalizeId('developerWebhookDeliveries', prior.resourceId);
			const replay = replayId ? await ctx.db.get(replayId) : null;
			if (!replay || replay.organizationId !== args.organizationId)
				throw new Error('idempotency_resource_missing');
			return { delivery: publicWebhookDelivery(replay), deduplicated: true };
		}
		const deliveryId = ctx.db.normalizeId('developerWebhookDeliveries', args.deliveryId);
		const delivery = deliveryId ? await ctx.db.get(deliveryId) : null;
		if (!delivery || delivery.organizationId !== args.organizationId)
			throw new Error('resource_not_found');
		const endpoint = await ctx.db.get(delivery.endpointId);
		if (!endpoint || endpoint.organizationId !== args.organizationId)
			throw new Error('resource_not_found');
		if (endpoint.status !== 'active') throw new Error('webhook_endpoint_inactive');
		const priorDeliveries = await ctx.db
			.query('developerWebhookDeliveries')
			.withIndex('by_endpoint_time', (q) => q.eq('endpointId', endpoint._id))
			.order('desc')
			.take(100);
		const attempt =
			Math.max(
				...priorDeliveries
					.filter((item) => item.eventId === delivery.eventId)
					.map((item) => item.attempt),
				0
			) + 1;
		const now = Date.now();
		const idempotencyId = await ctx.db.insert('developerApiIdempotency', {
			organizationId: args.organizationId,
			serviceAccountId: account._id,
			method: 'POST',
			route,
			key: args.idempotencyKey,
			requestFingerprint: args.requestFingerprint,
			status: 'in_progress',
			requestId: args.requestId,
			createdAt: now,
			updatedAt: now,
			expiresAt: now + 24 * 60 * 60_000
		});
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
		const replay = await ctx.db.get(replayId);
		if (!replay) throw new Error('webhook_replay_insert_failed');
		const response = publicWebhookDelivery(replay);
		await ctx.db.patch(idempotencyId, {
			status: 'completed',
			responseStatus: 202,
			responseBody: response,
			resourceId: String(replayId),
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.developerWebhookActions.deliver, {
			deliveryId: replayId
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'servicePrincipal',
			actorId: String(account._id),
			action: 'developer.webhook_replayed',
			resourceType: 'developerWebhookDelivery',
			resourceId: replayId,
			correlationId: `developer-event:${delivery.eventId}`,
			metadata: { requestId: args.requestId, priorDeliveryId: delivery._id, attempt }
		});
		return { delivery: response, deduplicated: false };
	}
});

async function requireDeveloperWebhookAccount(
	ctx: GenericMutationCtx<DataModel>,
	organizationId: Id<'organizations'>,
	serviceAccountId: Id<'developerServiceAccounts'>
): Promise<Doc<'developerServiceAccounts'>> {
	const account = await ctx.db.get(serviceAccountId);
	if (
		!account ||
		account.organizationId !== organizationId ||
		account.status !== 'active' ||
		!account.scopes.includes('webhooks:manage') ||
		(account.expiresAt !== undefined && account.expiresAt <= Date.now())
	)
		throw new Error('webhook_management_not_allowed');
	return account;
}

async function findApiIdempotency(
	ctx: GenericMutationCtx<DataModel>,
	args: {
		organizationId: Id<'organizations'>;
		serviceAccountId: Id<'developerServiceAccounts'>;
		route: string;
		key: string;
	}
): Promise<Doc<'developerApiIdempotency'> | null> {
	const record = await ctx.db
		.query('developerApiIdempotency')
		.withIndex('by_request', (q) =>
			q
				.eq('organizationId', args.organizationId)
				.eq('serviceAccountId', args.serviceAccountId)
				.eq('method', 'POST')
				.eq('route', args.route)
				.eq('key', args.key)
		)
		.unique();
	if (!record) return null;
	if (record.expiresAt > Date.now()) return record;
	await ctx.db.delete(record._id);
	return null;
}

function publicWebhookEndpoint(endpoint: Doc<'developerWebhookEndpoints'>) {
	return {
		id: endpoint._id,
		url: endpoint.url,
		eventTypes: endpoint.eventTypes,
		schemaVersion: endpoint.schemaVersion,
		status: endpoint.status,
		lastSuccessAt: endpoint.lastSuccessAt ? new Date(endpoint.lastSuccessAt).toISOString() : null,
		lastFailureAt: endpoint.lastFailureAt ? new Date(endpoint.lastFailureAt).toISOString() : null,
		createdAt: new Date(endpoint.createdAt).toISOString(),
		updatedAt: new Date(endpoint.updatedAt).toISOString()
	};
}

function publicWebhookDelivery(delivery: Doc<'developerWebhookDeliveries'>) {
	return {
		id: delivery._id,
		endpointId: delivery.endpointId,
		eventId: delivery.eventId,
		attempt: delivery.attempt,
		status: delivery.status,
		responseStatus: delivery.responseStatus ?? null,
		errorCode: delivery.errorCode ?? null,
		nextAttemptAt: delivery.nextAttemptAt ? new Date(delivery.nextAttemptAt).toISOString() : null,
		createdAt: new Date(delivery.createdAt).toISOString(),
		updatedAt: new Date(delivery.updatedAt).toISOString()
	};
}

async function listPublicBatches(
	ctx: GenericQueryCtx<import('./_generated/dataModel').DataModel>,
	args: { organizationId: Id<'organizations'>; walletIds: Id<'wallets'>[] },
	type: 'batch' | 'payroll'
) {
	const allowed = new Set(args.walletIds);
	const batches = await ctx.db
		.query('paymentBatches')
		.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
		.order('desc')
		.take(100);
	return batches
		.filter(
			(batch) => batch.type === type && (allowed.size === 0 || allowed.has(batch.sourceWalletId))
		)
		.map((batch) => ({
			id: batch._id,
			type: batch.type,
			name: batch.name,
			asset: batch.asset,
			totalAmount: batch.totalAmount,
			itemCount: batch.itemCount,
			status: batch.status,
			sourceWalletId: batch.sourceWalletId,
			scheduledFor: batch.scheduledFor ? new Date(batch.scheduledFor).toISOString() : null,
			payPeriodStart: batch.payPeriodStart ?? null,
			payPeriodEnd: batch.payPeriodEnd ?? null,
			payDate: batch.payDate ?? null,
			failureCode: batch.failureCode ?? null,
			createdAt: new Date(batch.createdAt).toISOString(),
			updatedAt: new Date(batch.updatedAt).toISOString()
		}));
}

function publicOperation(operation: Doc<'operations'>) {
	return {
		id: operation._id,
		kind: operation.kind,
		status: operation.status,
		asset: operation.asset ?? null,
		amount: operation.amount ?? null,
		destination: operation.destination ?? null,
		memo: operation.memo ?? null,
		reference: operation.reference,
		sourceWalletId: operation.sourceWalletId ?? null,
		correlationId: operation.correlationId,
		errorCode: operation.errorCode ?? null,
		createdAt: new Date(operation.createdAt).toISOString(),
		updatedAt: new Date(operation.updatedAt).toISOString()
	};
}

export const createPayment = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		credentialId: v.id('developerCredentials'),
		requestId: v.string(),
		idempotencyKey: v.string(),
		requestFingerprint: v.string(),
		walletId: v.id('wallets'),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		amount: v.string(),
		destination: v.string(),
		reference: v.string(),
		memo: v.optional(v.string())
	},
	returns: v.object({ operation: v.any(), deduplicated: v.boolean() }),
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.serviceAccountId);
		const credential = await ctx.db.get(args.credentialId);
		if (
			!account ||
			account.organizationId !== args.organizationId ||
			account.status !== 'active' ||
			!credential ||
			credential.organizationId !== args.organizationId ||
			credential.serviceAccountId !== account._id ||
			credential.status !== 'active' ||
			!account.scopes.includes('payments:create')
		)
			throw new Error('payment_not_allowed');
		if (!account.walletIds.includes(args.walletId)) throw new Error('wallet_not_allowed');
		const wallet = await ctx.db.get(args.walletId);
		if (!wallet || wallet.organizationId !== args.organizationId || wallet.chainId !== 84532)
			throw new Error('wallet_not_found');
		let existing = await ctx.db
			.query('developerApiIdempotency')
			.withIndex('by_request', (q) =>
				q
					.eq('organizationId', args.organizationId)
					.eq('serviceAccountId', account._id)
					.eq('method', 'POST')
					.eq('route', '/v1/payments')
					.eq('key', args.idempotencyKey)
			)
			.unique();
		if (existing && existing.expiresAt <= Date.now()) {
			await ctx.db.delete(existing._id);
			existing = null;
		}
		if (existing) {
			if (existing.requestFingerprint !== args.requestFingerprint)
				throw new Error('idempotency_key_reused');
			if (!existing.resourceId) throw new Error('idempotency_request_in_progress');
			const operation = await ctx.db.get(existing.resourceId as Id<'operations'>);
			if (!operation || operation.organizationId !== args.organizationId)
				throw new Error('idempotency_resource_missing');
			return { operation: publicOperation(operation), deduplicated: true };
		}
		let amount: string;
		let destination: string;
		try {
			amount = normalizeDecimal(args.amount, args.asset === 'USDC' ? 6 : 18);
			if (decimalToUnits(amount, args.asset === 'USDC' ? 6 : 18) <= 0n)
				throw new Error('non_positive_amount');
		} catch {
			throw new Error('invalid_amount');
		}
		try {
			destination = normalizeEvmAddress(args.destination);
		} catch {
			throw new Error('invalid_destination');
		}
		const reference = args.reference.trim();
		const memo = args.memo?.trim();
		if (!reference || reference.length > 80) throw new Error('invalid_reference');
		if (memo && memo.length > 140) throw new Error('invalid_memo');
		const now = Date.now();
		const idempotencyId = await ctx.db.insert('developerApiIdempotency', {
			organizationId: args.organizationId,
			serviceAccountId: account._id,
			method: 'POST',
			route: '/v1/payments',
			key: args.idempotencyKey,
			requestFingerprint: args.requestFingerprint,
			status: 'in_progress',
			requestId: args.requestId,
			createdAt: now,
			updatedAt: now,
			expiresAt: now + 24 * 60 * 60_000
		});
		const correlationId = `api:${account._id}:${args.idempotencyKey}`;
		const operationId = await ctx.db.insert('operations', {
			organizationId: args.organizationId,
			kind: 'payment',
			status: 'queued',
			approvalPath: 'privyIntent',
			asset: args.asset,
			amount,
			destination,
			memo,
			reference,
			requestKey: `${account._id}:${args.idempotencyKey}`,
			sourceWalletId: wallet._id,
			correlationId,
			createdAt: now,
			updatedAt: now
		});
		const operation = await ctx.db.get(operationId);
		if (!operation) throw new Error('operation_insert_failed');
		const attemptId = await ctx.db.insert('providerAttempts', {
			organizationId: args.organizationId,
			operationId,
			attemptKey: payoutAttemptKey(operationId),
			providerKind: 'privyIntent',
			status: 'pending',
			updatedAt: now
		});
		await ctx.db.patch(operationId, { providerAttemptId: attemptId });
		const response = publicOperation(operation);
		await ctx.db.patch(idempotencyId, {
			status: 'completed',
			responseStatus: 202,
			responseBody: response,
			resourceId: String(operationId),
			updatedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'servicePrincipal',
			actorId: String(account._id),
			action: 'payment.created',
			resourceType: 'operation',
			resourceId: operationId,
			correlationId,
			metadata: {
				requestId: args.requestId,
				asset: args.asset,
				amount,
				destination,
				approvalPath: 'privyIntent'
			}
		});
		await emitDeveloperEvent(ctx, {
			organizationId: args.organizationId,
			eventType: 'operation.created',
			aggregateType: 'operation',
			aggregateId: operationId,
			data: response
		});
		await ctx.scheduler.runAfter(0, internal.payoutAttemptState.claimAndSchedule, { attemptId });
		return { operation: response, deduplicated: false };
	}
});

async function payableSourceWalletId(
	ctx: GenericQueryCtx<DataModel>,
	payable: Doc<'payables'>
): Promise<Id<'wallets'> | undefined> {
	if (payable.sourceWalletId) return payable.sourceWalletId;
	if (!payable.operationId) return undefined;
	const operation = await ctx.db.get(payable.operationId);
	return operation?.organizationId === payable.organizationId
		? operation.sourceWalletId
		: undefined;
}

async function auditEventVisibleToWallets(
	ctx: GenericQueryCtx<DataModel>,
	event: Doc<'auditEvents'>,
	allowed: Set<Id<'wallets'>>
): Promise<boolean> {
	if (event.resourceType === 'wallet') {
		const walletId = ctx.db.normalizeId('wallets', event.resourceId);
		return Boolean(walletId && allowed.has(walletId));
	}
	if (event.resourceType === 'operation') {
		const id = ctx.db.normalizeId('operations', event.resourceId);
		const operation = id ? await ctx.db.get(id) : null;
		return Boolean(
			operation?.organizationId === event.organizationId &&
			operation.sourceWalletId &&
			allowed.has(operation.sourceWalletId)
		);
	}
	if (event.resourceType === 'invoice') {
		const id = ctx.db.normalizeId('invoices', event.resourceId);
		const invoice = id ? await ctx.db.get(id) : null;
		return Boolean(
			invoice?.organizationId === event.organizationId &&
			(allowed.has(invoice.treasuryWalletId) ||
				(invoice.collectionWalletId && allowed.has(invoice.collectionWalletId)))
		);
	}
	if (event.resourceType === 'payable') {
		const id = ctx.db.normalizeId('payables', event.resourceId);
		const payable = id ? await ctx.db.get(id) : null;
		if (!payable || payable.organizationId !== event.organizationId) return false;
		const walletId = await payableSourceWalletId(ctx, payable);
		return Boolean(walletId && allowed.has(walletId));
	}
	if (event.resourceType === 'paymentBatch') {
		const id = ctx.db.normalizeId('paymentBatches', event.resourceId);
		const batch = id ? await ctx.db.get(id) : null;
		return Boolean(
			batch?.organizationId === event.organizationId && allowed.has(batch.sourceWalletId)
		);
	}
	if (event.resourceType === 'paymentBatchItem') {
		const id = ctx.db.normalizeId('paymentBatchItems', event.resourceId);
		const item = id ? await ctx.db.get(id) : null;
		const batch = item ? await ctx.db.get(item.batchId) : null;
		return Boolean(
			item?.organizationId === event.organizationId &&
			batch?.organizationId === event.organizationId &&
			allowed.has(batch.sourceWalletId)
		);
	}
	if (event.resourceType === 'automationRun') {
		const id = ctx.db.normalizeId('automationRuns', event.resourceId);
		const run = id ? await ctx.db.get(id) : null;
		const automation = run ? await ctx.db.get(run.automationId) : null;
		return Boolean(
			run?.organizationId === event.organizationId &&
			automation?.organizationId === event.organizationId &&
			automation.sourceWalletId &&
			allowed.has(automation.sourceWalletId)
		);
	}
	return false;
}

export const recordRequest = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		credentialId: v.id('developerCredentials'),
		requestId: v.string(),
		method: v.string(),
		route: v.string(),
		status: v.number(),
		durationMs: v.number(),
		errorCode: v.optional(v.string()),
		idempotencyKeyHash: v.optional(v.string()),
		correlationId: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.serviceAccountId);
		const credential = await ctx.db.get(args.credentialId);
		if (
			!account ||
			!credential ||
			account.organizationId !== args.organizationId ||
			credential.organizationId !== args.organizationId
		)
			return null;
		await ctx.db.insert('developerApiRequests', { ...args, createdAt: Date.now() });
		return null;
	}
});

export const pruneExpiredSecurityRecords = internalMutation({
	args: {},
	returns: v.object({ nonces: v.number(), idempotencyRecords: v.number() }),
	handler: async (ctx) => {
		const now = Date.now();
		const nonces = await ctx.db
			.query('developerApiNonces')
			.withIndex('by_expiry', (q) => q.lt('expiresAt', now))
			.take(500);
		const records = await ctx.db
			.query('developerApiIdempotency')
			.withIndex('by_expiry', (q) => q.lt('expiresAt', now))
			.take(500);
		for (const record of [...nonces, ...records]) await ctx.db.delete(record._id);
		return { nonces: nonces.length, idempotencyRecords: records.length };
	}
});
