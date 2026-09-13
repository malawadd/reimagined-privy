import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { appendAudit } from './lib/audit';

const connectionValidator = v.object({
	_id: v.id('erpConnections'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	provider: v.literal('erpnext'),
	label: v.string(),
	baseUrl: v.string(),
	credentialMode: v.union(v.literal('saved'), v.literal('transient')),
	apiKeyHint: v.string(),
	status: v.union(v.literal('connected'), v.literal('error'), v.literal('disabled')),
	remoteUser: v.optional(v.string()),
	remoteSiteName: v.optional(v.string()),
	availableCompanies: v.optional(v.array(v.string())),
	selectedCompany: v.optional(v.string()),
	autoSyncEnabled: v.boolean(),
	autoSyncIntervalMinutes: v.optional(v.number()),
	nextSyncAt: v.optional(v.number()),
	lastInvoiceSyncAt: v.optional(v.number()),
	lastVerifiedAt: v.optional(v.number()),
	lastSyncAt: v.optional(v.number()),
	lastErrorCode: v.optional(v.string()),
	createdBy: v.id('users'),
	createdAt: v.number(),
	updatedAt: v.number()
});

const accountValidator = v.object({
	_id: v.id('erpExternalAccounts'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	connectionId: v.id('erpConnections'),
	providerAccountId: v.string(),
	accountName: v.string(),
	accountNumber: v.optional(v.string()),
	rootType: v.optional(v.string()),
	accountType: v.optional(v.string()),
	parentAccount: v.optional(v.string()),
	company: v.optional(v.string()),
	isGroup: v.boolean(),
	disabled: v.boolean(),
	accountCurrency: v.optional(v.string()),
	providerModifiedAt: v.optional(v.string()),
	syncedAt: v.number()
});

const runValidator = v.object({
	_id: v.id('erpSyncRuns'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	connectionId: v.id('erpConnections'),
	runKey: v.string(),
	kind: v.union(
		v.literal('chartOfAccounts'),
		v.literal('masterData'),
		v.literal('openPurchaseInvoices'),
		v.literal('openSalesInvoices')
	),
	status: v.union(
		v.literal('pending'),
		v.literal('claimed'),
		v.literal('submitted'),
		v.literal('succeeded'),
		v.literal('failed'),
		v.literal('ambiguous')
	),
	requestedBy: v.optional(v.id('users')),
	initiatedBy: v.union(v.literal('user'), v.literal('schedule')),
	providerReferenceId: v.string(),
	itemCount: v.optional(v.number()),
	errorCode: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	finishedAt: v.optional(v.number())
});

const externalDocumentValidator = v.object({
	_id: v.id('erpExternalDocuments'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	connectionId: v.id('erpConnections'),
	documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
	providerDocumentId: v.string(),
	company: v.string(),
	party: v.optional(v.string()),
	partyName: v.optional(v.string()),
	currency: v.string(),
	grandTotal: v.string(),
	outstandingAmount: v.string(),
	postingDate: v.optional(v.string()),
	dueDate: v.optional(v.string()),
	status: v.string(),
	providerModifiedAt: v.optional(v.string()),
	syncedAt: v.number()
});

export const listConnections = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(connectionValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connections = await ctx.db
			.query('erpConnections')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(50);
		return connections.map((connection) => ({
			_id: connection._id,
			_creationTime: connection._creationTime,
			organizationId: connection.organizationId,
			provider: connection.provider,
			label: connection.label,
			baseUrl: connection.baseUrl,
			credentialMode: connection.credentialMode,
			apiKeyHint: connection.apiKeyHint,
			status: connection.status,
			remoteUser: connection.remoteUser,
			remoteSiteName: connection.remoteSiteName,
			availableCompanies: connection.availableCompanies,
			selectedCompany: connection.selectedCompany,
			autoSyncEnabled: connection.autoSyncEnabled,
			autoSyncIntervalMinutes: connection.autoSyncIntervalMinutes,
			nextSyncAt: connection.nextSyncAt,
			lastInvoiceSyncAt: connection.lastInvoiceSyncAt,
			lastVerifiedAt: connection.lastVerifiedAt,
			lastSyncAt: connection.lastSyncAt,
			lastErrorCode: connection.lastErrorCode,
			createdBy: connection.createdBy,
			createdAt: connection.createdAt,
			updatedAt: connection.updatedAt
		}));
	}
});

export const configureConnection = mutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		selectedCompany: v.string(),
		autoSyncEnabled: v.boolean(),
		autoSyncIntervalMinutes: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		if (connection.status === 'disabled') throw new Error('ERPNext connection is disabled.');
		const selectedCompany = args.selectedCompany.trim();
		if (!connection.availableCompanies?.includes(selectedCompany))
			throw new Error('Select a company returned by this ERPNext site.');
		const interval = args.autoSyncEnabled ? (args.autoSyncIntervalMinutes ?? 60) : undefined;
		if (args.autoSyncEnabled && connection.credentialMode !== 'saved')
			throw new Error('Background sync requires a saved credential.');
		if (
			interval !== undefined &&
			(!Number.isInteger(interval) || interval < 15 || interval > 1_440)
		)
			throw new Error('Auto-sync interval must be 15 to 1440 minutes.');
		const now = Date.now();
		await ctx.db.patch(connection._id, {
			selectedCompany,
			autoSyncEnabled: args.autoSyncEnabled,
			autoSyncIntervalMinutes: interval,
			nextSyncAt: args.autoSyncEnabled ? now : undefined,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'erp.connection_configured',
			resourceType: 'erpConnection',
			resourceId: connection._id,
			correlationId: `erp-connection:${connection._id}`,
			metadata: { provider: 'erpnext', selectedCompany, autoSyncEnabled: args.autoSyncEnabled }
		});
		return null;
	}
});

export const listAccounts = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.array(accountValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		return ctx.db
			.query('erpExternalAccounts')
			.withIndex('by_connection', (q) => q.eq('connectionId', args.connectionId))
			.take(5_000);
	}
});

export const listReferenceData = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		referenceType: v.optional(
			v.union(
				v.literal('supplier'),
				v.literal('customer'),
				v.literal('costCenter'),
				v.literal('currency'),
				v.literal('employee'),
				v.literal('item')
			)
		)
	},
	returns: v.array(
		v.object({
			_id: v.id('erpReferenceData'),
			referenceType: v.union(
				v.literal('supplier'),
				v.literal('customer'),
				v.literal('costCenter'),
				v.literal('currency'),
				v.literal('employee'),
				v.literal('item')
			),
			providerReferenceId: v.string(),
			displayName: v.string(),
			company: v.optional(v.string()),
			disabled: v.boolean(),
			currency: v.optional(v.string()),
			email: v.optional(v.string()),
			syncedAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const rows = args.referenceType
			? await ctx.db
					.query('erpReferenceData')
					.withIndex('by_connection_type', (q) =>
						q.eq('connectionId', connection._id).eq('referenceType', args.referenceType!)
					)
					.take(2_500)
			: await ctx.db
					.query('erpReferenceData')
					.withIndex('by_connection', (q) => q.eq('connectionId', connection._id))
					.take(10_000);
		return rows.map((row) => ({
			_id: row._id,
			referenceType: row.referenceType,
			providerReferenceId: row.providerReferenceId,
			displayName: row.displayName,
			company: row.company,
			disabled: row.disabled,
			currency: row.currency,
			email: row.email,
			syncedAt: row.syncedAt
		}));
	}
});

export const listExportSources = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({
			sourceType: v.union(v.literal('payable'), v.literal('invoice')),
			sourceId: v.string(),
			label: v.string(),
			counterparty: v.string(),
			amount: v.string(),
			status: v.string(),
			createdAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const [payables, invoices] = await Promise.all([
			ctx.db
				.query('payables')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(100),
			ctx.db
				.query('invoices')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(100)
		]);
		return [
			...payables
				.filter((row) => row.type === 'bill' && row.status !== 'void')
				.map((row) => ({
					sourceType: 'payable' as const,
					sourceId: row._id,
					label: `Bill ${row.reference}`,
					counterparty: row.payeeName,
					amount: row.amount,
					status: row.status,
					createdAt: row.createdAt
				})),
			...invoices
				.filter((row) => row.status !== 'void' && row.status !== 'failed')
				.map((row) => ({
					sourceType: 'invoice' as const,
					sourceId: row._id,
					label: `Invoice ${row.invoiceNumber}`,
					counterparty: row.customerName,
					amount: row.amount,
					status: row.status,
					createdAt: row.createdAt
				}))
		].sort((a, b) => b.createdAt - a.createdAt);
	}
});

export const listDocumentPushRuns = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.array(
		v.object({
			_id: v.id('erpDocumentPushRuns'),
			sourceType: v.union(v.literal('payable'), v.literal('invoice')),
			sourceId: v.string(),
			documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
			remoteReference: v.string(),
			status: v.union(
				v.literal('claimed'),
				v.literal('submitted'),
				v.literal('ambiguous'),
				v.literal('succeeded'),
				v.literal('failed')
			),
			providerDocumentId: v.optional(v.string()),
			errorCode: v.optional(v.string()),
			updatedAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const runs = await ctx.db
			.query('erpDocumentPushRuns')
			.withIndex('by_connection', (q) => q.eq('connectionId', connection._id))
			.order('desc')
			.take(50);
		return runs.map((run) => ({
			_id: run._id,
			sourceType: run.sourceType,
			sourceId: run.sourceId,
			documentType: run.documentType,
			remoteReference: run.remoteReference,
			status: run.status,
			providerDocumentId: run.providerDocumentId,
			errorCode: run.errorCode,
			updatedAt: run.updatedAt
		}));
	}
});

export const listRuns = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.array(runValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		return ctx.db
			.query('erpSyncRuns')
			.withIndex('by_connection', (q) => q.eq('connectionId', args.connectionId))
			.order('desc')
			.take(25);
	}
});

export const listDocuments = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice'))
	},
	returns: v.array(externalDocumentValidator),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		return ctx.db
			.query('erpExternalDocuments')
			.withIndex('by_connection_type', (q) =>
				q.eq('connectionId', args.connectionId).eq('documentType', args.documentType)
			)
			.take(2_500);
	}
});

export const listMappings = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.array(
		v.object({
			_id: v.id('erpAccountMappings'),
			externalAccountId: v.id('erpExternalAccounts'),
			chartAccountId: v.id('chartAccounts'),
			status: v.union(v.literal('active'), v.literal('disabled')),
			externalAccountName: v.string(),
			chartAccountCode: v.string(),
			chartAccountName: v.string()
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const mappings = await ctx.db
			.query('erpAccountMappings')
			.withIndex('by_connection', (q) => q.eq('connectionId', args.connectionId))
			.take(2_500);
		return Promise.all(
			mappings.map(async (mapping) => {
				const [external, chart] = await Promise.all([
					ctx.db.get(mapping.externalAccountId),
					ctx.db.get(mapping.chartAccountId)
				]);
				assertOrgScoped(external, args.organizationId);
				assertOrgScoped(chart, args.organizationId);
				return {
					_id: mapping._id,
					externalAccountId: mapping.externalAccountId,
					chartAccountId: mapping.chartAccountId,
					status: mapping.status,
					externalAccountName: external.accountName,
					chartAccountCode: chart.code,
					chartAccountName: chart.name
				};
			})
		);
	}
});

export const setMapping = mutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		externalAccountId: v.id('erpExternalAccounts'),
		chartAccountId: v.id('chartAccounts'),
		status: v.union(v.literal('active'), v.literal('disabled'))
	},
	returns: v.id('erpAccountMappings'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'integration:manage');
		const [connection, external, chart] = await Promise.all([
			ctx.db.get(args.connectionId),
			ctx.db.get(args.externalAccountId),
			ctx.db.get(args.chartAccountId)
		]);
		assertOrgScoped(connection, args.organizationId);
		assertOrgScoped(external, args.organizationId);
		assertOrgScoped(chart, args.organizationId);
		if (external.connectionId !== connection._id) throw new Error('Resource not found.');
		if (external.isGroup || external.disabled)
			throw new Error('Only active posting accounts can be mapped.');
		if (!chart.isPosting || !chart.active)
			throw new Error('Select an active Ratib posting account.');
		const existing = await ctx.db
			.query('erpAccountMappings')
			.withIndex('by_connection_external', (q) =>
				q.eq('connectionId', connection._id).eq('externalAccountId', external._id)
			)
			.unique();
		const now = Date.now();
		const mappingId = existing
			? (await ctx.db.patch(existing._id, {
					chartAccountId: chart._id,
					status: args.status,
					updatedAt: now
				}),
				existing._id)
			: await ctx.db.insert('erpAccountMappings', {
					organizationId: args.organizationId,
					connectionId: connection._id,
					externalAccountId: external._id,
					chartAccountId: chart._id,
					status: args.status,
					createdBy: user._id,
					createdAt: now,
					updatedAt: now
				});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'erp.account_mapping_set',
			resourceType: 'erpAccountMapping',
			resourceId: mappingId,
			correlationId: `erp-mapping:${mappingId}`,
			metadata: { provider: 'erpnext', status: args.status }
		});
		return mappingId;
	}
});

export const listSettlementSources = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({
			sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
			sourceId: v.string(),
			direction: v.union(v.literal('pay'), v.literal('receive')),
			label: v.string(),
			amount: v.string(),
			createdAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const [operations, receipts] = await Promise.all([
			ctx.db
				.query('operations')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', args.organizationId).eq('status', 'succeeded')
				)
				.order('desc')
				.take(100),
			ctx.db
				.query('invoicePayments')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(100)
		]);
		const paySources = operations
			.filter(
				(operation) => operation.sourcePayableId && operation.asset === 'USDC' && operation.amount
			)
			.map((operation) => ({
				sourceType: 'operation' as const,
				sourceId: operation._id,
				direction: 'pay' as const,
				label: operation.reference,
				amount: operation.amount!,
				createdAt: operation.createdAt
			}));
		const receiptSources = await Promise.all(
			receipts.map(async (receipt) => {
				const invoice = await ctx.db.get(receipt.invoiceId);
				assertOrgScoped(invoice, args.organizationId);
				return {
					sourceType: 'invoicePayment' as const,
					sourceId: receipt._id,
					direction: 'receive' as const,
					label: `Invoice ${invoice.invoiceNumber}`,
					amount: receipt.amount,
					createdAt: receipt.receivedAt
				};
			})
		);
		return [...paySources, ...receiptSources].sort((a, b) => b.createdAt - a.createdAt);
	}
});

export const listSettlementRuns = query({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.array(
		v.object({
			_id: v.id('erpSettlementRuns'),
			_creationTime: v.number(),
			organizationId: v.id('organizations'),
			connectionId: v.id('erpConnections'),
			sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
			sourceId: v.string(),
			direction: v.union(v.literal('pay'), v.literal('receive')),
			runKey: v.string(),
			remoteReference: v.string(),
			status: v.union(
				v.literal('pending'),
				v.literal('claimed'),
				v.literal('submitted'),
				v.literal('ambiguous'),
				v.literal('succeeded'),
				v.literal('failed')
			),
			providerDocumentId: v.optional(v.string()),
			errorCode: v.optional(v.string()),
			requestedBy: v.id('users'),
			createdAt: v.number(),
			updatedAt: v.number(),
			finishedAt: v.optional(v.number())
		})
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		return ctx.db
			.query('erpSettlementRuns')
			.withIndex('by_connection', (q) => q.eq('connectionId', args.connectionId))
			.order('desc')
			.take(50);
	}
});
