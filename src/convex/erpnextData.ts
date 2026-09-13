import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { appendAudit } from './lib/audit';
import { decimalToUnits, normalizeDecimal } from '../lib/domain';

const encryptedCredentialsValidator = v.object({
	version: v.literal(1),
	iv: v.string(),
	ciphertext: v.string(),
	authTag: v.string()
});

const accountInputValidator = v.object({
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
	providerModifiedAt: v.optional(v.string())
});

const documentInputValidator = v.object({
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
	providerModifiedAt: v.optional(v.string())
});

const referenceTypeValidator = v.union(
	v.literal('supplier'),
	v.literal('customer'),
	v.literal('costCenter'),
	v.literal('currency'),
	v.literal('employee'),
	v.literal('item')
);

const referenceInputValidator = v.object({
	referenceType: referenceTypeValidator,
	providerReferenceId: v.string(),
	displayName: v.string(),
	company: v.optional(v.string()),
	disabled: v.boolean(),
	currency: v.optional(v.string()),
	email: v.optional(v.string()),
	providerModifiedAt: v.optional(v.string())
});

export const authorizeOrganization = internalQuery({
	args: { organizationId: v.id('organizations') },
	returns: v.object({ userId: v.id('users'), actorId: v.string() }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'integration:manage');
		return { userId: user._id, actorId: user.privyDid };
	}
});

export const saveConnection = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		label: v.string(),
		baseUrl: v.string(),
		encryptedCredentials: encryptedCredentialsValidator,
		apiKeyHint: v.string(),
		remoteUser: v.string(),
		remoteSiteName: v.string(),
		availableCompanies: v.array(v.string()),
		userId: v.id('users'),
		actorId: v.string()
	},
	returns: v.id('erpConnections'),
	handler: async (ctx, args) => {
		const existing = (
			await ctx.db
				.query('erpConnections')
				.withIndex('by_org_provider', (q) =>
					q.eq('organizationId', args.organizationId).eq('provider', 'erpnext')
				)
				.take(50)
		).find((connection) => connection.baseUrl === args.baseUrl);
		const now = Date.now();
		let connectionId: Id<'erpConnections'>;
		if (existing) {
			const selectedCompany =
				existing.selectedCompany && args.availableCompanies.includes(existing.selectedCompany)
					? existing.selectedCompany
					: args.availableCompanies.length === 1
						? args.availableCompanies[0]
						: undefined;
			await ctx.db.patch(existing._id, {
				label: args.label,
				encryptedCredentials: args.encryptedCredentials,
				apiKeyHint: args.apiKeyHint,
				status: 'connected',
				remoteUser: args.remoteUser,
				remoteSiteName: args.remoteSiteName,
				availableCompanies: args.availableCompanies,
				selectedCompany,
				autoSyncEnabled: existing.autoSyncEnabled && Boolean(selectedCompany),
				lastVerifiedAt: now,
				lastErrorCode: undefined,
				updatedAt: now
			});
			connectionId = existing._id;
		} else {
			connectionId = await ctx.db.insert('erpConnections', {
				organizationId: args.organizationId,
				provider: 'erpnext',
				label: args.label,
				baseUrl: args.baseUrl,
				credentialMode: 'saved',
				encryptedCredentials: args.encryptedCredentials,
				apiKeyHint: args.apiKeyHint,
				status: 'connected',
				remoteUser: args.remoteUser,
				remoteSiteName: args.remoteSiteName,
				availableCompanies: args.availableCompanies,
				selectedCompany:
					args.availableCompanies.length === 1 ? args.availableCompanies[0] : undefined,
				autoSyncEnabled: false,
				lastVerifiedAt: now,
				createdBy: args.userId,
				createdAt: now,
				updatedAt: now
			});
		}
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: args.actorId === 'system:erpnext-scheduler' ? 'system' : 'user',
			actorId: args.actorId,
			action: existing ? 'erp.connection_reauthorized' : 'erp.connection_created',
			resourceType: 'erpConnection',
			resourceId: connectionId,
			correlationId: `erp-connection:${connectionId}`,
			metadata: { provider: 'erpnext', remoteSiteName: args.remoteSiteName }
		});
		return connectionId;
	}
});

export const saveTransientConnection = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		baseUrl: v.string(),
		remoteUser: v.string(),
		remoteSiteName: v.string(),
		availableCompanies: v.array(v.string()),
		selectedCompany: v.string(),
		userId: v.id('users'),
		actorId: v.string()
	},
	returns: v.id('erpConnections'),
	handler: async (ctx, args) => {
		const existing = (
			await ctx.db
				.query('erpConnections')
				.withIndex('by_org_provider', (q) =>
					q.eq('organizationId', args.organizationId).eq('provider', 'erpnext')
				)
				.take(50)
		).find(
			(connection) =>
				connection.baseUrl === args.baseUrl && connection.credentialMode === 'transient'
		);
		const now = Date.now();
		let connectionId: Id<'erpConnections'>;
		if (existing) {
			await ctx.db.patch(existing._id, {
				label: `${args.remoteSiteName} foreground sync`,
				status: 'connected',
				remoteUser: args.remoteUser,
				remoteSiteName: args.remoteSiteName,
				availableCompanies: args.availableCompanies,
				selectedCompany: args.selectedCompany,
				autoSyncEnabled: false,
				autoSyncIntervalMinutes: undefined,
				nextSyncAt: undefined,
				lastVerifiedAt: now,
				lastErrorCode: undefined,
				updatedAt: now
			});
			connectionId = existing._id;
		} else {
			connectionId = await ctx.db.insert('erpConnections', {
				organizationId: args.organizationId,
				provider: 'erpnext',
				label: `${args.remoteSiteName} foreground sync`,
				baseUrl: args.baseUrl,
				credentialMode: 'transient',
				apiKeyHint: 'Not saved',
				status: 'connected',
				remoteUser: args.remoteUser,
				remoteSiteName: args.remoteSiteName,
				availableCompanies: args.availableCompanies,
				selectedCompany: args.selectedCompany,
				autoSyncEnabled: false,
				lastVerifiedAt: now,
				createdBy: args.userId,
				createdAt: now,
				updatedAt: now
			});
		}
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: args.actorId,
			action: 'erp.transient_sync_authorized',
			resourceType: 'erpConnection',
			resourceId: connectionId,
			correlationId: `erp-connection:${connectionId}`,
			metadata: { provider: 'erpnext', remoteSiteName: args.remoteSiteName }
		});
		return connectionId;
	}
});

export const getConnectionSecret = internalQuery({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.object({
		baseUrl: v.string(),
		selectedCompany: v.optional(v.string()),
		encryptedCredentials: encryptedCredentialsValidator
	}),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		if (connection.status === 'disabled' || !connection.encryptedCredentials)
			throw new Error('ERPNext connection is disabled.');
		return {
			baseUrl: connection.baseUrl,
			selectedCompany: connection.selectedCompany,
			encryptedCredentials: connection.encryptedCredentials
		};
	}
});

export const getScheduledConnectionSecret = internalQuery({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.object({
		baseUrl: v.string(),
		selectedCompany: v.string(),
		encryptedCredentials: encryptedCredentialsValidator
	}),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		if (
			!connection.autoSyncEnabled ||
			connection.status === 'disabled' ||
			!connection.selectedCompany ||
			!connection.encryptedCredentials
		)
			throw new Error('ERPNext auto-sync is unavailable.');
		return {
			baseUrl: connection.baseUrl,
			selectedCompany: connection.selectedCompany,
			encryptedCredentials: connection.encryptedCredentials
		};
	}
});

export const claimSync = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		requestKey: v.string(),
		kind: v.union(
			v.literal('chartOfAccounts'),
			v.literal('masterData'),
			v.literal('openPurchaseInvoices'),
			v.literal('openSalesInvoices')
		),
		initiatedBy: v.union(v.literal('user'), v.literal('schedule'))
	},
	returns: v.object({
		runId: v.id('erpSyncRuns'),
		claimed: v.boolean(),
		status: v.union(
			v.literal('claimed'),
			v.literal('submitted'),
			v.literal('succeeded'),
			v.literal('failed'),
			v.literal('ambiguous')
		)
	}),
	handler: async (
		ctx,
		args
	): Promise<{
		runId: Id<'erpSyncRuns'>;
		claimed: boolean;
		status: 'claimed' | 'submitted' | 'succeeded' | 'failed' | 'ambiguous';
	}> => {
		const user =
			args.initiatedBy === 'user'
				? (await requireMembership(ctx, args.organizationId, 'integration:manage')).user
				: undefined;
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		if (
			connection.status === 'disabled' ||
			(!connection.encryptedCredentials && connection.credentialMode !== 'transient')
		)
			throw new Error('ERPNext connection is disabled.');
		const requestKey = args.requestKey.trim();
		if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestKey)) throw new Error('Invalid sync request key.');
		const runKey = `erpnext:${args.connectionId}:${args.kind}:${requestKey}`;
		const existing = await ctx.db
			.query('erpSyncRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (
			existing &&
			args.initiatedBy === 'schedule' &&
			(existing.status === 'claimed' || existing.status === 'submitted') &&
			existing.updatedAt < Date.now() - 10 * 60_000
		) {
			await ctx.db.patch(existing._id, { status: 'claimed', updatedAt: Date.now() });
			return { runId: existing._id, claimed: true, status: 'claimed' };
		}
		if (existing)
			return {
				runId: existing._id,
				claimed: false,
				status:
					existing.status === 'pending'
						? ('claimed' as const)
						: (existing.status as 'claimed' | 'submitted' | 'succeeded' | 'failed' | 'ambiguous')
			};
		const now = Date.now();
		const runId = await ctx.db.insert('erpSyncRuns', {
			organizationId: args.organizationId,
			connectionId: args.connectionId,
			runKey,
			kind: args.kind,
			status: 'claimed',
			requestedBy: user?._id,
			initiatedBy: args.initiatedBy,
			providerReferenceId: runKey,
			createdAt: now,
			updatedAt: now
		});
		return { runId, claimed: true, status: 'claimed' };
	}
});

export const markSyncSubmitted = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		runId: v.id('erpSyncRuns')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		if (run.connectionId !== connection._id) throw new Error('Resource not found.');
		if (run.status === 'claimed')
			await ctx.db.patch(run._id, { status: 'submitted', updatedAt: Date.now() });
		return null;
	}
});

export const completeSync = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		runId: v.id('erpSyncRuns'),
		accounts: v.array(accountInputValidator),
		actorId: v.string()
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		if (run.connectionId !== connection._id) throw new Error('Resource not found.');
		if (run.status === 'succeeded') return run.itemCount ?? 0;
		if (run.status !== 'claimed' && run.status !== 'submitted')
			throw new Error('ERP sync run is not active.');

		const now = Date.now();
		const previous = await ctx.db
			.query('erpExternalAccounts')
			.withIndex('by_connection', (q) => q.eq('connectionId', args.connectionId))
			.take(5_000);
		const previousByProviderId = new Map(
			previous.map((account) => [account.providerAccountId, account])
		);
		const providerIds = new Set<string>();
		for (const account of args.accounts) {
			if (providerIds.has(account.providerAccountId))
				throw new Error('ERPNext returned duplicate account identifiers.');
			providerIds.add(account.providerAccountId);
			const existing = previousByProviderId.get(account.providerAccountId);
			const document = {
				organizationId: args.organizationId,
				connectionId: args.connectionId,
				...account,
				syncedAt: now
			};
			if (existing) await ctx.db.patch(existing._id, document);
			else await ctx.db.insert('erpExternalAccounts', document);
		}
		for (const account of previous)
			if (!providerIds.has(account.providerAccountId)) await ctx.db.delete(account._id);

		await ctx.db.patch(run._id, {
			status: 'succeeded',
			itemCount: args.accounts.length,
			updatedAt: now,
			finishedAt: now,
			errorCode: undefined
		});
		await ctx.db.patch(connection._id, {
			status: 'connected',
			lastSyncAt: now,
			nextSyncAt: connection.autoSyncEnabled
				? now + (connection.autoSyncIntervalMinutes ?? 60) * 60_000
				: undefined,
			lastErrorCode: undefined,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: args.actorId === 'system:erpnext-scheduler' ? 'system' : 'user',
			actorId: args.actorId,
			action: 'erp.chart_of_accounts_synced',
			resourceType: 'erpConnection',
			resourceId: connection._id,
			correlationId: run.runKey,
			metadata: { provider: 'erpnext', itemCount: args.accounts.length }
		});
		return args.accounts.length;
	}
});

export const completeReferenceSync = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		runId: v.id('erpSyncRuns'),
		references: v.array(referenceInputValidator),
		actorId: v.string()
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		if (run.connectionId !== connection._id || run.kind !== 'masterData')
			throw new Error('Resource not found.');
		if (run.status === 'succeeded') return run.itemCount ?? 0;
		if (run.status !== 'claimed' && run.status !== 'submitted')
			throw new Error('ERP sync run is not active.');
		const now = Date.now();
		const previous = await ctx.db
			.query('erpReferenceData')
			.withIndex('by_connection', (q) => q.eq('connectionId', connection._id))
			.take(10_000);
		const previousByKey = new Map(
			previous.map((item) => [`${item.referenceType}:${item.providerReferenceId}`, item])
		);
		const seen = new Set<string>();
		for (const reference of args.references) {
			const key = `${reference.referenceType}:${reference.providerReferenceId}`;
			if (seen.has(key)) throw new Error('ERPNext returned duplicate reference identifiers.');
			seen.add(key);
			const value = {
				organizationId: args.organizationId,
				connectionId: connection._id,
				...reference,
				syncedAt: now
			};
			const existing = previousByKey.get(key);
			if (existing) await ctx.db.patch(existing._id, value);
			else await ctx.db.insert('erpReferenceData', value);
		}
		for (const reference of previous) {
			const key = `${reference.referenceType}:${reference.providerReferenceId}`;
			if (!seen.has(key)) await ctx.db.delete(reference._id);
		}
		await ctx.db.patch(run._id, {
			status: 'succeeded',
			itemCount: args.references.length,
			updatedAt: now,
			finishedAt: now,
			errorCode: undefined
		});
		await ctx.db.patch(connection._id, {
			status: 'connected',
			lastSyncAt: now,
			nextSyncAt: connection.autoSyncEnabled
				? now + (connection.autoSyncIntervalMinutes ?? 60) * 60_000
				: undefined,
			lastErrorCode: undefined,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: args.actorId === 'system:erpnext-scheduler' ? 'system' : 'user',
			actorId: args.actorId,
			action: 'erp.master_data_synced',
			resourceType: 'erpConnection',
			resourceId: connection._id,
			correlationId: run.runKey,
			metadata: { provider: 'erpnext', itemCount: args.references.length }
		});
		return args.references.length;
	}
});

export const completeDocumentSync = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		runId: v.id('erpSyncRuns'),
		documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
		documents: v.array(documentInputValidator),
		actorId: v.string()
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		if (run.connectionId !== connection._id) throw new Error('Resource not found.');
		if (run.status === 'succeeded') return run.itemCount ?? 0;
		if (run.status !== 'claimed' && run.status !== 'submitted')
			throw new Error('ERP sync run is not active.');
		if (args.documents.some((document) => document.documentType !== args.documentType))
			throw new Error('ERPNext document type mismatch.');
		const now = Date.now();
		const previous = await ctx.db
			.query('erpExternalDocuments')
			.withIndex('by_connection_type', (q) =>
				q.eq('connectionId', args.connectionId).eq('documentType', args.documentType)
			)
			.take(5_000);
		const previousByProviderId = new Map(
			previous.map((document) => [document.providerDocumentId, document])
		);
		const providerIds = new Set<string>();
		for (const document of args.documents) {
			if (providerIds.has(document.providerDocumentId))
				throw new Error('ERPNext returned duplicate document identifiers.');
			providerIds.add(document.providerDocumentId);
			const existing = previousByProviderId.get(document.providerDocumentId);
			const value = {
				organizationId: args.organizationId,
				connectionId: args.connectionId,
				...document,
				syncedAt: now
			};
			if (existing) await ctx.db.patch(existing._id, value);
			else await ctx.db.insert('erpExternalDocuments', value);
		}
		for (const document of previous)
			if (!providerIds.has(document.providerDocumentId)) await ctx.db.delete(document._id);
		await ctx.db.patch(run._id, {
			status: 'succeeded',
			itemCount: args.documents.length,
			updatedAt: now,
			finishedAt: now,
			errorCode: undefined
		});
		await ctx.db.patch(connection._id, {
			status: 'connected',
			lastInvoiceSyncAt: now,
			nextSyncAt: connection.autoSyncEnabled
				? now + (connection.autoSyncIntervalMinutes ?? 60) * 60_000
				: undefined,
			lastErrorCode: undefined,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: args.actorId === 'system:erpnext-scheduler' ? 'system' : 'user',
			actorId: args.actorId,
			action: 'erp.open_documents_synced',
			resourceType: 'erpConnection',
			resourceId: connection._id,
			correlationId: run.runKey,
			metadata: {
				provider: 'erpnext',
				documentType: args.documentType,
				itemCount: args.documents.length
			}
		});
		return args.documents.length;
	}
});

export const getDueConnections = internalQuery({
	args: { now: v.number() },
	returns: v.array(
		v.object({
			organizationId: v.id('organizations'),
			connectionId: v.id('erpConnections'),
			nextSyncAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		const connections = await ctx.db
			.query('erpConnections')
			.withIndex('by_auto_due', (q) => q.eq('autoSyncEnabled', true).lte('nextSyncAt', args.now))
			.take(20);
		return connections
			.filter(
				(connection) =>
					connection.status !== 'disabled' &&
					Boolean(connection.encryptedCredentials) &&
					Boolean(connection.selectedCompany) &&
					connection.nextSyncAt !== undefined
			)
			.map((connection) => ({
				organizationId: connection.organizationId,
				connectionId: connection._id,
				nextSyncAt: connection.nextSyncAt!
			}));
	}
});

export const getSettlementContext = internalQuery({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
		sourceId: v.string(),
		externalDocumentId: v.id('erpExternalDocuments'),
		bankExternalAccountId: v.id('erpExternalAccounts')
	},
	returns: v.object({
		actorId: v.string(),
		userId: v.id('users'),
		direction: v.union(v.literal('pay'), v.literal('receive')),
		amount: v.string(),
		settledAt: v.number(),
		company: v.string(),
		documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
		providerDocumentId: v.string(),
		party: v.string(),
		currency: v.string(),
		outstandingAmount: v.string(),
		bankAccount: v.string()
	}),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'integration:manage');
		const [connection, document, bankAccount] = await Promise.all([
			ctx.db.get(args.connectionId),
			ctx.db.get(args.externalDocumentId),
			ctx.db.get(args.bankExternalAccountId)
		]);
		assertOrgScoped(connection, args.organizationId);
		assertOrgScoped(document, args.organizationId);
		assertOrgScoped(bankAccount, args.organizationId);
		if (
			document.connectionId !== connection._id ||
			bankAccount.connectionId !== connection._id ||
			connection.selectedCompany !== document.company
		)
			throw new Error('Resource not found.');
		if (!document.party) throw new Error('ERPNext invoice has no settlement party.');
		if (bankAccount.disabled || bankAccount.isGroup)
			throw new Error('Select an active ERPNext posting account.');
		if (
			bankAccount.accountCurrency &&
			bankAccount.accountCurrency.toUpperCase() !== document.currency.toUpperCase()
		)
			throw new Error('ERPNext bank and invoice currencies must match for settlement posting.');
		const mapping = await ctx.db
			.query('erpAccountMappings')
			.withIndex('by_connection_external', (q) =>
				q.eq('connectionId', connection._id).eq('externalAccountId', bankAccount._id)
			)
			.unique();
		if (!mapping || mapping.status !== 'active')
			throw new Error('Map the ERPNext bank account before posting settlements.');

		let direction: 'pay' | 'receive';
		let amount: string;
		let settledAt: number;
		if (args.sourceType === 'operation') {
			const sourceId = ctx.db.normalizeId('operations', args.sourceId);
			const operation = sourceId ? await ctx.db.get(sourceId) : null;
			assertOrgScoped(operation, args.organizationId);
			if (
				operation.status !== 'succeeded' ||
				operation.asset !== 'USDC' ||
				!operation.amount ||
				!operation.sourcePayableId
			)
				throw new Error('Only a succeeded USDC payable operation can settle a purchase invoice.');
			if (document.documentType !== 'purchaseInvoice')
				throw new Error('Outgoing payments can only settle ERPNext purchase invoices.');
			direction = 'pay';
			amount = normalizeDecimal(operation.amount, 6);
			settledAt = operation.updatedAt;
		} else {
			const sourceId = ctx.db.normalizeId('invoicePayments', args.sourceId);
			const payment = sourceId ? await ctx.db.get(sourceId) : null;
			assertOrgScoped(payment, args.organizationId);
			if (payment.asset !== 'USDC') throw new Error('Only USDC receipts can be posted to ERPNext.');
			if (document.documentType !== 'salesInvoice')
				throw new Error('Incoming receipts can only settle ERPNext sales invoices.');
			direction = 'receive';
			amount = normalizeDecimal(payment.amount, 6);
			settledAt = payment.receivedAt;
		}
		const outstandingAmount = normalizeDecimal(document.outstandingAmount, 6);
		if (decimalToUnits(amount, 6) > decimalToUnits(outstandingAmount, 6))
			throw new Error('Ratib settlement exceeds the ERPNext outstanding amount.');
		if (!['USD', 'USDC'].includes(document.currency.toUpperCase()))
			throw new Error('Only USD or USDC ERPNext invoices can receive Ratib USDC settlements.');
		return {
			actorId: user.privyDid,
			userId: user._id,
			direction,
			amount,
			settledAt,
			company: document.company,
			documentType: document.documentType,
			providerDocumentId: document.providerDocumentId,
			party: document.party,
			currency: document.currency,
			outstandingAmount,
			bankAccount: bankAccount.providerAccountId
		};
	}
});

export const claimSettlement = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
		sourceId: v.string(),
		direction: v.union(v.literal('pay'), v.literal('receive')),
		externalDocumentId: v.id('erpExternalDocuments'),
		requestedBy: v.id('users')
	},
	returns: v.object({
		runId: v.id('erpSettlementRuns'),
		claimed: v.boolean(),
		status: v.union(
			v.literal('claimed'),
			v.literal('submitted'),
			v.literal('ambiguous'),
			v.literal('succeeded'),
			v.literal('failed')
		),
		remoteReference: v.string(),
		providerDocumentId: v.optional(v.string())
	}),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const runKey = `erpnext:settlement:${args.connectionId}:${args.sourceType}:${args.sourceId}:${args.externalDocumentId}`;
		const remoteReference = `RATIB-${args.sourceType === 'operation' ? 'OP' : 'RCPT'}-${args.sourceId}`;
		const existing = await ctx.db
			.query('erpSettlementRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (existing) {
			if (
				existing.status === 'ambiguous' ||
				existing.status === 'failed' ||
				((existing.status === 'claimed' || existing.status === 'submitted') &&
					existing.updatedAt < Date.now() - 2 * 60_000)
			) {
				await ctx.db.patch(existing._id, {
					status: 'claimed',
					errorCode: undefined,
					updatedAt: Date.now(),
					finishedAt: undefined
				});
				return {
					runId: existing._id,
					claimed: true,
					status: 'claimed' as const,
					remoteReference: existing.remoteReference,
					providerDocumentId: existing.providerDocumentId
				};
			}
			return {
				runId: existing._id,
				claimed: false,
				status: existing.status === 'pending' ? ('claimed' as const) : existing.status,
				remoteReference: existing.remoteReference,
				providerDocumentId: existing.providerDocumentId
			};
		}
		const conflicting = await ctx.db
			.query('erpSettlementRuns')
			.withIndex('by_source', (q) =>
				q
					.eq('organizationId', args.organizationId)
					.eq('sourceType', args.sourceType)
					.eq('sourceId', args.sourceId)
			)
			.first();
		if (conflicting) throw new Error('This Ratib settlement already has an ERPNext posting run.');
		const now = Date.now();
		const runId = await ctx.db.insert('erpSettlementRuns', {
			organizationId: args.organizationId,
			connectionId: args.connectionId,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			direction: args.direction,
			runKey,
			remoteReference,
			status: 'claimed',
			requestedBy: args.requestedBy,
			createdAt: now,
			updatedAt: now
		});
		return { runId, claimed: true, status: 'claimed' as const, remoteReference };
	}
});

export const markSettlementSubmitted = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		runId: v.id('erpSettlementRuns'),
		providerDocumentId: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		await ctx.db.patch(run._id, {
			status: 'submitted',
			providerDocumentId: args.providerDocumentId ?? run.providerDocumentId,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const finishSettlement = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		runId: v.id('erpSettlementRuns'),
		status: v.union(v.literal('ambiguous'), v.literal('succeeded'), v.literal('failed')),
		providerDocumentId: v.optional(v.string()),
		errorCode: v.optional(v.string()),
		actorId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		const now = Date.now();
		await ctx.db.patch(run._id, {
			status: args.status,
			providerDocumentId: args.providerDocumentId ?? run.providerDocumentId,
			errorCode: args.errorCode?.slice(0, 80),
			updatedAt: now,
			finishedAt: args.status === 'ambiguous' ? undefined : now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: args.actorId,
			action: `erp.settlement_${args.status}`,
			resourceType: 'erpSettlementRun',
			resourceId: run._id,
			correlationId: run.runKey,
			metadata: {
				provider: 'erpnext',
				remoteReference: run.remoteReference,
				providerDocumentId: args.providerDocumentId ?? run.providerDocumentId,
				errorCode: args.errorCode?.slice(0, 80)
			}
		});
		return null;
	}
});

export const failSync = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		runId: v.id('erpSyncRuns'),
		errorCode: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		if (run.connectionId !== connection._id) throw new Error('Resource not found.');
		const now = Date.now();
		if (run.status !== 'succeeded')
			await ctx.db.patch(run._id, {
				status: 'failed',
				errorCode: args.errorCode.slice(0, 80),
				updatedAt: now,
				finishedAt: now
			});
		await ctx.db.patch(connection._id, {
			status: 'error',
			lastErrorCode: args.errorCode.slice(0, 80),
			nextSyncAt: connection.autoSyncEnabled ? now + 15 * 60_000 : undefined,
			updatedAt: now
		});
		return null;
	}
});

export const disconnect = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		actorId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'integration:manage');
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		await ctx.db.patch(connection._id, {
			status: 'disabled',
			encryptedCredentials: undefined,
			autoSyncEnabled: false,
			nextSyncAt: undefined,
			lastErrorCode: undefined,
			updatedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: args.actorId,
			action: 'erp.connection_disabled',
			resourceType: 'erpConnection',
			resourceId: connection._id,
			correlationId: `erp-connection:${connection._id}`,
			metadata: { provider: 'erpnext' }
		});
		return null;
	}
});

export const getDocumentPushContext = internalQuery({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		sourceType: v.union(v.literal('payable'), v.literal('invoice')),
		sourceId: v.string(),
		partyReferenceId: v.id('erpReferenceData'),
		itemReferenceId: v.id('erpReferenceData'),
		externalAccountId: v.id('erpExternalAccounts')
	},
	returns: v.object({
		actorId: v.string(),
		userId: v.id('users'),
		company: v.string(),
		documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
		party: v.string(),
		postingDate: v.string(),
		dueDate: v.string(),
		currency: v.literal('USD'),
		account: v.string(),
		itemCode: v.string(),
		items: v.array(v.object({ description: v.string(), quantity: v.string(), rate: v.string() }))
	}),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'integration:manage');
		const [connection, party, item, account] = await Promise.all([
			ctx.db.get(args.connectionId),
			ctx.db.get(args.partyReferenceId),
			ctx.db.get(args.itemReferenceId),
			ctx.db.get(args.externalAccountId)
		]);
		assertOrgScoped(connection, args.organizationId);
		assertOrgScoped(party, args.organizationId);
		assertOrgScoped(item, args.organizationId);
		assertOrgScoped(account, args.organizationId);
		if (!connection.selectedCompany || connection.status === 'disabled')
			throw new Error('Select an active ERPNext company first.');
		if (
			party.connectionId !== connection._id ||
			item.connectionId !== connection._id ||
			account.connectionId !== connection._id
		)
			throw new Error('Resource not found.');
		const expectedPartyType = args.sourceType === 'payable' ? 'supplier' : 'customer';
		if (party.referenceType !== expectedPartyType || party.disabled)
			throw new Error(`Select an active ERPNext ${expectedPartyType}.`);
		if (item.referenceType !== 'item' || item.disabled)
			throw new Error('Select an active ERPNext item.');
		if (account.isGroup || account.disabled)
			throw new Error('Select an active ERPNext posting account.');
		if (account.company && account.company !== connection.selectedCompany)
			throw new Error('ERPNext posting account belongs to another company.');
		const mapping = await ctx.db
			.query('erpAccountMappings')
			.withIndex('by_connection_external', (q) =>
				q.eq('connectionId', connection._id).eq('externalAccountId', account._id)
			)
			.unique();
		if (!mapping || mapping.status !== 'active')
			throw new Error('Map the ERPNext posting account before exporting documents.');

		let dueAt: number;
		let items: Array<{ description: string; quantity: string; rate: string }>;
		if (args.sourceType === 'payable') {
			const sourceId = ctx.db.normalizeId('payables', args.sourceId);
			const payable = sourceId ? await ctx.db.get(sourceId) : null;
			assertOrgScoped(payable, args.organizationId);
			if (payable.type !== 'bill' || payable.status === 'void')
				throw new Error('Only active Ratib bills can be exported to ERPNext.');
			dueAt = payable.dueAt;
			items = [
				{
					description: payable.memo || `Bill ${payable.reference} from ${payable.payeeName}`,
					quantity: '1',
					rate: normalizeDecimal(payable.amount, 6)
				}
			];
		} else {
			const sourceId = ctx.db.normalizeId('invoices', args.sourceId);
			const invoice = sourceId ? await ctx.db.get(sourceId) : null;
			assertOrgScoped(invoice, args.organizationId);
			if (invoice.status === 'void' || invoice.status === 'failed')
				throw new Error('Only active Ratib invoices can be exported to ERPNext.');
			dueAt = invoice.dueAt;
			items = invoice.lineItems.map((line) => ({
				description: line.description,
				quantity: normalizeDecimal(line.quantity, 0),
				rate: normalizeDecimal(line.unitAmount, 6)
			}));
		}
		const day = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
		return {
			actorId: user.privyDid,
			userId: user._id,
			company: connection.selectedCompany,
			documentType:
				args.sourceType === 'payable' ? ('purchaseInvoice' as const) : ('salesInvoice' as const),
			party: party.providerReferenceId,
			postingDate: day(Date.now()),
			dueDate: day(dueAt),
			currency: 'USD' as const,
			account: account.providerAccountId,
			itemCode: item.providerReferenceId,
			items
		};
	}
});

export const claimDocumentPush = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		sourceType: v.union(v.literal('payable'), v.literal('invoice')),
		sourceId: v.string(),
		documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
		requestedBy: v.id('users')
	},
	returns: v.object({
		runId: v.id('erpDocumentPushRuns'),
		claimed: v.boolean(),
		status: v.union(
			v.literal('claimed'),
			v.literal('submitted'),
			v.literal('ambiguous'),
			v.literal('succeeded'),
			v.literal('failed')
		),
		remoteReference: v.string(),
		providerDocumentId: v.optional(v.string())
	}),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		assertOrgScoped(connection, args.organizationId);
		const runKey = `erpnext:draft:${args.connectionId}:${args.sourceType}:${args.sourceId}`;
		const remoteReference = `RATIB-${args.sourceType === 'payable' ? 'BILL' : 'INV'}-${args.sourceId}`;
		const existing = await ctx.db
			.query('erpDocumentPushRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (existing) {
			const retryable =
				existing.status === 'ambiguous' ||
				existing.status === 'failed' ||
				((existing.status === 'claimed' || existing.status === 'submitted') &&
					existing.updatedAt < Date.now() - 2 * 60_000);
			if (retryable) {
				await ctx.db.patch(existing._id, {
					status: 'claimed',
					errorCode: undefined,
					updatedAt: Date.now(),
					finishedAt: undefined
				});
				return {
					runId: existing._id,
					claimed: true,
					status: 'claimed' as const,
					remoteReference: existing.remoteReference,
					providerDocumentId: existing.providerDocumentId
				};
			}
			return {
				runId: existing._id,
				claimed: false,
				status: existing.status,
				remoteReference: existing.remoteReference,
				providerDocumentId: existing.providerDocumentId
			};
		}
		const conflict = await ctx.db
			.query('erpDocumentPushRuns')
			.withIndex('by_source', (q) =>
				q
					.eq('organizationId', args.organizationId)
					.eq('sourceType', args.sourceType)
					.eq('sourceId', args.sourceId)
			)
			.first();
		if (conflict) throw new Error('This Ratib document already has an ERPNext export run.');
		const now = Date.now();
		const runId = await ctx.db.insert('erpDocumentPushRuns', {
			organizationId: args.organizationId,
			connectionId: connection._id,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			documentType: args.documentType,
			runKey,
			remoteReference,
			status: 'claimed',
			requestedBy: args.requestedBy,
			createdAt: now,
			updatedAt: now
		});
		return { runId, claimed: true, status: 'claimed' as const, remoteReference };
	}
});

export const markDocumentPushSubmitted = internalMutation({
	args: { organizationId: v.id('organizations'), runId: v.id('erpDocumentPushRuns') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		if (run.status === 'claimed')
			await ctx.db.patch(run._id, { status: 'submitted', updatedAt: Date.now() });
		return null;
	}
});

export const finishDocumentPush = internalMutation({
	args: {
		organizationId: v.id('organizations'),
		runId: v.id('erpDocumentPushRuns'),
		status: v.union(v.literal('ambiguous'), v.literal('succeeded'), v.literal('failed')),
		providerDocumentId: v.optional(v.string()),
		errorCode: v.optional(v.string()),
		actorId: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		assertOrgScoped(run, args.organizationId);
		const now = Date.now();
		await ctx.db.patch(run._id, {
			status: args.status,
			providerDocumentId: args.providerDocumentId ?? run.providerDocumentId,
			errorCode: args.errorCode?.slice(0, 80),
			updatedAt: now,
			finishedAt: args.status === 'ambiguous' ? undefined : now
		});
		const openCases = await ctx.db
			.query('reconciliationCases')
			.withIndex('by_org_status', (q) =>
				q.eq('organizationId', args.organizationId).eq('status', 'open')
			)
			.take(250);
		const existingCase = openCases.find(
			(item) => item.sourceType === 'erpDocumentPushRun' && item.sourceId === String(run._id)
		);
		if (args.status === 'succeeded' && existingCase) {
			await ctx.db.patch(existingCase._id, {
				status: 'resolved',
				resolution: 'Reconciled by deterministic ERPNext reference lookup.',
				resolvedAt: now
			});
		} else if (args.status !== 'succeeded' && !existingCase) {
			await ctx.db.insert('reconciliationCases', {
				organizationId: args.organizationId,
				kind: 'syncFailure',
				sourceType: 'erpDocumentPushRun',
				sourceId: String(run._id),
				status: 'open',
				severity: args.status === 'ambiguous' ? 'blocking' : 'warning',
				title:
					args.status === 'ambiguous'
						? 'ERPNext draft outcome is uncertain'
						: 'ERPNext draft export failed',
				details: `Reference ${run.remoteReference}; error ${args.errorCode?.slice(0, 80) ?? 'unknown'}.`,
				createdAt: now
			});
		}
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: args.actorId,
			action: `erp.draft_${args.status}`,
			resourceType: 'erpDocumentPushRun',
			resourceId: run._id,
			correlationId: run.runKey,
			metadata: {
				provider: 'erpnext',
				remoteReference: run.remoteReference,
				providerDocumentId: args.providerDocumentId ?? run.providerDocumentId,
				errorCode: args.errorCode?.slice(0, 80)
			}
		});
		return null;
	}
});
