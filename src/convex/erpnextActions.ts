'use node';

import { v } from 'convex/values';
import { action, internalAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
	decryptERPNextCredentials,
	encryptERPNextCredentials,
	erpCredentialContext
} from './erpnext/credentials';
import {
	createERPNextGateway,
	ERPNextGatewayError,
	erpNextErrorCode,
	erpNextErrorMessage,
	erpNextWriteMayBeAmbiguous,
	normalizeERPNextBaseUrl
} from './erpnext/gateway';
import {
	apiKeyHint,
	normalizeERPNextCredentials,
	paymentEntryMatchesSettlement,
	type EncryptedERPNextCredentials,
	type ERPNextCredentials
} from './erpnext/types';
import { decimalToUnits, normalizeDecimal } from '../lib/domain';

type SyncKind = 'chartOfAccounts' | 'masterData' | 'openPurchaseInvoices' | 'openSalesInvoices';
type SyncResult = {
	runId: Id<'erpSyncRuns'>;
	status: 'claimed' | 'submitted' | 'succeeded' | 'failed' | 'ambiguous';
	itemCount?: number;
	deduplicated: boolean;
};

type DocumentPushResult = {
	runId: Id<'erpDocumentPushRuns'>;
	status: 'claimed' | 'submitted' | 'succeeded';
	providerDocumentId?: string;
	deduplicated: boolean;
};

type TransientSyncResult = {
	connectionId: Id<'erpConnections'>;
	accounts: number;
	references: number;
	purchaseInvoices: number;
	salesInvoices: number;
};

type DocumentPushContext = {
	actorId: string;
	userId: Id<'users'>;
	company: string;
	documentType: 'purchaseInvoice' | 'salesInvoice';
	party: string;
	postingDate: string;
	dueDate: string;
	currency: 'USD';
	account: string;
	itemCode: string;
	items: Array<{ description: string; quantity: string; rate: string }>;
};

const syncResultValidator = v.object({
	runId: v.id('erpSyncRuns'),
	status: v.union(
		v.literal('claimed'),
		v.literal('submitted'),
		v.literal('succeeded'),
		v.literal('failed'),
		v.literal('ambiguous')
	),
	itemCount: v.optional(v.number()),
	deduplicated: v.boolean()
});

const connectionTestValidator = v.object({
	remoteUser: v.string(),
	remoteSiteName: v.string(),
	companies: v.array(v.string())
});

function credentialEncryptionKey() {
	const key = process.env.ERP_CREDENTIAL_WRAPPING_KEY;
	if (!key)
		throw new Error('Saved ERP connections are unavailable until encryption is configured.');
	return key;
}

function normalizeLabel(value: string) {
	const label = value.trim();
	if (!label || label.length > 80) throw new Error('Connection label must be 1 to 80 characters.');
	return label;
}

async function executeSync(
	ctx: ActionCtx,
	args: {
		organizationId: Id<'organizations'>;
		connectionId: Id<'erpConnections'>;
		requestKey: string;
		kind: SyncKind;
		initiatedBy: 'user' | 'schedule';
		actorId: string;
		secret: {
			baseUrl: string;
			selectedCompany?: string;
			encryptedCredentials?: EncryptedERPNextCredentials;
		};
		transientCredentials?: ERPNextCredentials;
	}
): Promise<SyncResult> {
	const claim = await ctx.runMutation(internal.erpnextData.claimSync, {
		organizationId: args.organizationId,
		connectionId: args.connectionId,
		requestKey: args.requestKey,
		kind: args.kind,
		initiatedBy: args.initiatedBy
	});
	if (!claim.claimed) return { runId: claim.runId, status: claim.status, deduplicated: true };
	try {
		const credentials = args.transientCredentials
			? args.transientCredentials
			: args.secret.encryptedCredentials
				? decryptERPNextCredentials(
						args.secret.encryptedCredentials,
						credentialEncryptionKey(),
						erpCredentialContext(args.organizationId, args.secret.baseUrl)
					)
				: (() => {
						throw new Error('ERPNext credentials are unavailable.');
					})();
		await ctx.runMutation(internal.erpnextData.markSyncSubmitted, {
			organizationId: args.organizationId,
			connectionId: args.connectionId,
			runId: claim.runId
		});
		const gateway = createERPNextGateway(args.secret.baseUrl, credentials);
		let itemCount: number;
		if (args.kind === 'chartOfAccounts') {
			const accounts = await gateway.listAccounts();
			itemCount = await ctx.runMutation(internal.erpnextData.completeSync, {
				organizationId: args.organizationId,
				connectionId: args.connectionId,
				runId: claim.runId,
				accounts,
				actorId: args.actorId
			});
		} else if (args.kind === 'masterData') {
			if (!args.secret.selectedCompany) throw new ERPNextGatewayError('company_required', false);
			const references = await gateway.listReferenceData(args.secret.selectedCompany);
			itemCount = await ctx.runMutation(internal.erpnextData.completeReferenceSync, {
				organizationId: args.organizationId,
				connectionId: args.connectionId,
				runId: claim.runId,
				references,
				actorId: args.actorId
			});
		} else {
			if (!args.secret.selectedCompany) throw new ERPNextGatewayError('company_required', false);
			const documentType =
				args.kind === 'openPurchaseInvoices' ? 'purchaseInvoice' : 'salesInvoice';
			const documents = await gateway.listOpenInvoices(documentType, args.secret.selectedCompany);
			itemCount = await ctx.runMutation(internal.erpnextData.completeDocumentSync, {
				organizationId: args.organizationId,
				connectionId: args.connectionId,
				runId: claim.runId,
				documentType,
				documents,
				actorId: args.actorId
			});
		}
		return { runId: claim.runId, status: 'succeeded', itemCount, deduplicated: false };
	} catch (error) {
		const errorCode = erpNextErrorCode(error);
		await ctx.runMutation(internal.erpnextData.failSync, {
			organizationId: args.organizationId,
			connectionId: args.connectionId,
			runId: claim.runId,
			errorCode
		});
		throw new Error(
			errorCode === 'erpnext_request_failed'
				? 'ERPNext reference sync failed. The connection needs attention.'
				: erpNextErrorMessage(error),
			{ cause: error }
		);
	}
}

export const testConnection = action({
	args: {
		organizationId: v.id('organizations'),
		baseUrl: v.string(),
		apiKey: v.string(),
		apiSecret: v.string()
	},
	returns: v.object({
		credentialMode: v.literal('transient'),
		connection: connectionTestValidator
	}),
	handler: async (
		ctx,
		args
	): Promise<{
		credentialMode: 'transient';
		connection: { remoteUser: string; remoteSiteName: string; companies: string[] };
	}> => {
		await ctx.runQuery(internal.erpnextData.authorizeOrganization, {
			organizationId: args.organizationId
		});
		const baseUrl = normalizeERPNextBaseUrl(args.baseUrl);
		const credentials = normalizeERPNextCredentials({
			apiKey: args.apiKey,
			apiSecret: args.apiSecret
		});
		try {
			return {
				credentialMode: 'transient' as const,
				connection: await createERPNextGateway(baseUrl, credentials).testConnection()
			};
		} catch (error) {
			throw new Error(erpNextErrorMessage(error), { cause: error });
		}
	}
});

export const saveConnection = action({
	args: {
		organizationId: v.id('organizations'),
		label: v.string(),
		baseUrl: v.string(),
		apiKey: v.string(),
		apiSecret: v.string()
	},
	returns: v.object({
		connectionId: v.id('erpConnections'),
		connection: connectionTestValidator
	}),
	handler: async (
		ctx,
		args
	): Promise<{
		connectionId: Id<'erpConnections'>;
		connection: { remoteUser: string; remoteSiteName: string; companies: string[] };
	}> => {
		const scope = await ctx.runQuery(internal.erpnextData.authorizeOrganization, {
			organizationId: args.organizationId
		});
		const label = normalizeLabel(args.label);
		const baseUrl = normalizeERPNextBaseUrl(args.baseUrl);
		const credentials = normalizeERPNextCredentials({
			apiKey: args.apiKey,
			apiSecret: args.apiSecret
		});
		let connection;
		try {
			connection = await createERPNextGateway(baseUrl, credentials).testConnection();
		} catch (error) {
			throw new Error(erpNextErrorMessage(error), { cause: error });
		}
		const encryptedCredentials = encryptERPNextCredentials(
			credentials,
			credentialEncryptionKey(),
			erpCredentialContext(args.organizationId, baseUrl)
		);
		const connectionId = await ctx.runMutation(internal.erpnextData.saveConnection, {
			organizationId: args.organizationId,
			label,
			baseUrl,
			encryptedCredentials,
			apiKeyHint: apiKeyHint(credentials.apiKey),
			remoteUser: connection.remoteUser,
			remoteSiteName: connection.remoteSiteName,
			availableCompanies: connection.companies,
			userId: scope.userId,
			actorId: scope.actorId
		});
		return { connectionId, connection };
	}
});

export const syncChartOfAccounts = action({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		requestKey: v.string()
	},
	returns: syncResultValidator,
	handler: async (
		ctx,
		args
	): Promise<{
		runId: Id<'erpSyncRuns'>;
		status: 'claimed' | 'submitted' | 'succeeded' | 'failed' | 'ambiguous';
		itemCount?: number;
		deduplicated: boolean;
	}> => {
		const [scope, secret] = await Promise.all([
			ctx.runQuery(internal.erpnextData.authorizeOrganization, {
				organizationId: args.organizationId
			}),
			ctx.runQuery(internal.erpnextData.getConnectionSecret, {
				organizationId: args.organizationId,
				connectionId: args.connectionId
			})
		]);
		return executeSync(ctx, {
			...args,
			kind: 'chartOfAccounts',
			initiatedBy: 'user',
			actorId: scope.actorId,
			secret
		});
	}
});

export const syncReferenceData = action({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		requestKey: v.string(),
		kind: v.union(
			v.literal('masterData'),
			v.literal('openPurchaseInvoices'),
			v.literal('openSalesInvoices')
		)
	},
	returns: syncResultValidator,
	handler: async (ctx, args): Promise<SyncResult> => {
		const [scope, secret] = await Promise.all([
			ctx.runQuery(internal.erpnextData.authorizeOrganization, {
				organizationId: args.organizationId
			}),
			ctx.runQuery(internal.erpnextData.getConnectionSecret, {
				organizationId: args.organizationId,
				connectionId: args.connectionId
			})
		]);
		return executeSync(ctx, {
			...args,
			initiatedBy: 'user',
			actorId: scope.actorId,
			secret
		});
	}
});

export const syncTransient = action({
	args: {
		organizationId: v.id('organizations'),
		baseUrl: v.string(),
		apiKey: v.string(),
		apiSecret: v.string(),
		selectedCompany: v.string(),
		requestKey: v.string()
	},
	returns: v.object({
		connectionId: v.id('erpConnections'),
		accounts: v.number(),
		references: v.number(),
		purchaseInvoices: v.number(),
		salesInvoices: v.number()
	}),
	handler: async (ctx, args): Promise<TransientSyncResult> => {
		const scope: { userId: Id<'users'>; actorId: string } = await ctx.runQuery(
			internal.erpnextData.authorizeOrganization,
			{
				organizationId: args.organizationId
			}
		);
		const baseUrl = normalizeERPNextBaseUrl(args.baseUrl);
		const credentials = normalizeERPNextCredentials({
			apiKey: args.apiKey,
			apiSecret: args.apiSecret
		});
		const gateway = createERPNextGateway(baseUrl, credentials);
		let verified: { remoteUser: string; remoteSiteName: string; companies: string[] };
		try {
			verified = await gateway.testConnection();
		} catch (error) {
			throw new Error(erpNextErrorMessage(error), { cause: error });
		}
		const selectedCompany = args.selectedCompany.trim();
		if (!verified.companies.includes(selectedCompany))
			throw new Error('Select a company returned by this ERPNext site.');
		const connectionId: Id<'erpConnections'> = await ctx.runMutation(
			internal.erpnextData.saveTransientConnection,
			{
				organizationId: args.organizationId,
				baseUrl,
				remoteUser: verified.remoteUser,
				remoteSiteName: verified.remoteSiteName,
				availableCompanies: verified.companies,
				selectedCompany,
				userId: scope.userId,
				actorId: scope.actorId
			}
		);
		const counts = new Map<SyncKind, number>();
		for (const kind of [
			'chartOfAccounts',
			'masterData',
			'openPurchaseInvoices',
			'openSalesInvoices'
		] as const) {
			const result = await executeSync(ctx, {
				organizationId: args.organizationId,
				connectionId,
				requestKey: `${args.requestKey}_${kind}`,
				kind,
				initiatedBy: 'user',
				actorId: scope.actorId,
				secret: { baseUrl, selectedCompany },
				transientCredentials: credentials
			});
			counts.set(kind, result.itemCount ?? 0);
		}
		return {
			connectionId,
			accounts: counts.get('chartOfAccounts') ?? 0,
			references: counts.get('masterData') ?? 0,
			purchaseInvoices: counts.get('openPurchaseInvoices') ?? 0,
			salesInvoices: counts.get('openSalesInvoices') ?? 0
		};
	}
});

export const syncDueConnections = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const due = await ctx.runQuery(internal.erpnextData.getDueConnections, { now: Date.now() });
		for (const connection of due) {
			try {
				const secret = await ctx.runQuery(internal.erpnextData.getScheduledConnectionSecret, {
					organizationId: connection.organizationId,
					connectionId: connection.connectionId
				});
				for (const kind of [
					'chartOfAccounts',
					'masterData',
					'openPurchaseInvoices',
					'openSalesInvoices'
				] as const)
					await executeSync(ctx, {
						organizationId: connection.organizationId,
						connectionId: connection.connectionId,
						requestKey: `scheduled_${Math.floor(connection.nextSyncAt / 60_000)}_${kind}`,
						kind,
						initiatedBy: 'schedule',
						actorId: 'system:erpnext-scheduler',
						secret
					});
			} catch {
				// The durable run and connection carry the sanitized error for operator review.
			}
		}
		return null;
	}
});

export const pushDraftDocument = action({
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
		runId: v.id('erpDocumentPushRuns'),
		status: v.union(v.literal('claimed'), v.literal('submitted'), v.literal('succeeded')),
		providerDocumentId: v.optional(v.string()),
		deduplicated: v.boolean()
	}),
	handler: async (ctx, args): Promise<DocumentPushResult> => {
		const [secret, document] = (await Promise.all([
			ctx.runQuery(internal.erpnextData.getConnectionSecret, {
				organizationId: args.organizationId,
				connectionId: args.connectionId
			}),
			ctx.runQuery(internal.erpnextData.getDocumentPushContext, args)
		])) as [
			{
				baseUrl: string;
				selectedCompany?: string;
				encryptedCredentials: EncryptedERPNextCredentials;
			},
			DocumentPushContext
		];
		const claim: {
			runId: Id<'erpDocumentPushRuns'>;
			claimed: boolean;
			status: 'claimed' | 'submitted' | 'ambiguous' | 'succeeded' | 'failed';
			remoteReference: string;
			providerDocumentId?: string;
		} = await ctx.runMutation(internal.erpnextData.claimDocumentPush, {
			organizationId: args.organizationId,
			connectionId: args.connectionId,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			documentType: document.documentType,
			requestedBy: document.userId
		});
		if (!claim.claimed) {
			return {
				runId: claim.runId,
				status:
					claim.status === 'succeeded'
						? ('succeeded' as const)
						: claim.status === 'submitted'
							? ('submitted' as const)
							: ('claimed' as const),
				providerDocumentId: claim.providerDocumentId,
				deduplicated: true
			};
		}
		let writeStarted = false;
		try {
			const credentials = decryptERPNextCredentials(
				secret.encryptedCredentials,
				credentialEncryptionKey(),
				erpCredentialContext(args.organizationId, secret.baseUrl)
			);
			const gateway = createERPNextGateway(secret.baseUrl, credentials);
			let draft = await gateway.findDraftInvoiceByReference(
				document.documentType,
				document.company,
				document.party,
				claim.remoteReference
			);
			if (draft) {
				const expectedUnits = document.items.reduce(
					(total, item) => total + BigInt(item.quantity) * decimalToUnits(item.rate, 6),
					0n
				);
				const lineMismatch = draft.items.some((item, index) => {
					const expected = document.items[index];
					return (
						!expected ||
						item.itemCode !== document.itemCode ||
						item.account !== document.account ||
						normalizeDecimal(item.quantity, 18) !== normalizeDecimal(expected.quantity, 18) ||
						normalizeDecimal(item.rate, 6) !== normalizeDecimal(expected.rate, 6)
					);
				});
				if (
					draft.company !== document.company ||
					draft.party !== document.party ||
					draft.currency.toUpperCase() !== document.currency ||
					draft.dueDate !== document.dueDate ||
					draft.items.length !== document.items.length ||
					lineMismatch ||
					decimalToUnits(normalizeDecimal(draft.grandTotal, 6), 6) !== expectedUnits
				)
					throw new ERPNextGatewayError('stale_draft', false);
			}
			if (!draft) {
				await ctx.runMutation(internal.erpnextData.markDocumentPushSubmitted, {
					organizationId: args.organizationId,
					runId: claim.runId
				});
				writeStarted = true;
				draft = await gateway.createDraftInvoice({
					documentType: document.documentType,
					company: document.company,
					party: document.party,
					postingDate: document.postingDate,
					dueDate: document.dueDate,
					currency: document.currency,
					remoteReference: claim.remoteReference,
					items: document.items.map((item) => ({
						...item,
						itemCode: document.itemCode,
						account: document.account
					}))
				});
			}
			await ctx.runMutation(internal.erpnextData.finishDocumentPush, {
				organizationId: args.organizationId,
				runId: claim.runId,
				status: 'succeeded',
				providerDocumentId: draft.providerDocumentId,
				actorId: document.actorId
			});
			return {
				runId: claim.runId,
				status: 'succeeded' as const,
				providerDocumentId: draft.providerDocumentId,
				deduplicated: !writeStarted
			};
		} catch (error) {
			const ambiguous = writeStarted && erpNextWriteMayBeAmbiguous(error);
			await ctx.runMutation(internal.erpnextData.finishDocumentPush, {
				organizationId: args.organizationId,
				runId: claim.runId,
				status: ambiguous ? 'ambiguous' : 'failed',
				errorCode: erpNextErrorCode(error),
				actorId: document.actorId
			});
			throw new Error(
				ambiguous
					? 'ERPNext draft outcome is uncertain. Retry to reconcile by its Ratib reference.'
					: erpNextErrorMessage(error),
				{ cause: error }
			);
		}
	}
});

export const pushSettlement = action({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
		sourceId: v.string(),
		externalDocumentId: v.id('erpExternalDocuments'),
		bankExternalAccountId: v.id('erpExternalAccounts')
	},
	returns: v.object({
		runId: v.id('erpSettlementRuns'),
		status: v.union(v.literal('claimed'), v.literal('submitted'), v.literal('succeeded')),
		providerDocumentId: v.optional(v.string()),
		deduplicated: v.boolean()
	}),
	handler: async (
		ctx,
		args
	): Promise<{
		runId: Id<'erpSettlementRuns'>;
		status: 'claimed' | 'submitted' | 'succeeded';
		providerDocumentId?: string;
		deduplicated: boolean;
	}> => {
		const [secret, settlement] = await Promise.all([
			ctx.runQuery(internal.erpnextData.getConnectionSecret, {
				organizationId: args.organizationId,
				connectionId: args.connectionId
			}),
			ctx.runQuery(internal.erpnextData.getSettlementContext, args)
		]);
		const claim = await ctx.runMutation(internal.erpnextData.claimSettlement, {
			organizationId: args.organizationId,
			connectionId: args.connectionId,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			direction: settlement.direction,
			externalDocumentId: args.externalDocumentId,
			requestedBy: settlement.userId
		});
		if (!claim.claimed) {
			if (claim.status === 'succeeded')
				return {
					runId: claim.runId,
					status: 'succeeded',
					providerDocumentId: claim.providerDocumentId,
					deduplicated: true
				};
			return {
				runId: claim.runId,
				status: claim.status === 'submitted' ? 'submitted' : 'claimed',
				providerDocumentId: claim.providerDocumentId,
				deduplicated: true
			};
		}

		let writeStarted = false;
		let providerDocumentId = claim.providerDocumentId;
		try {
			const credentials = decryptERPNextCredentials(
				secret.encryptedCredentials,
				credentialEncryptionKey(),
				erpCredentialContext(args.organizationId, secret.baseUrl)
			);
			const gateway = createERPNextGateway(secret.baseUrl, credentials);
			let payment = await gateway.findPaymentByReference(claim.remoteReference, settlement.company);
			if (
				payment &&
				!paymentEntryMatchesSettlement(
					{ ...payment, amount: normalizeDecimal(payment.amount, 6) },
					{ ...settlement, amount: normalizeDecimal(settlement.amount, 6) }
				)
			)
				throw new ERPNextGatewayError('stale_invoice', false);
			if (!payment) {
				const invoice = await gateway.getSettlementInvoice(
					settlement.documentType,
					settlement.providerDocumentId
				);
				if (
					invoice.company !== settlement.company ||
					invoice.party !== settlement.party ||
					invoice.currency !== settlement.currency ||
					invoice.providerDocumentId !== settlement.providerDocumentId ||
					decimalToUnits(normalizeDecimal(invoice.outstandingAmount, 6), 6) <
						decimalToUnits(settlement.amount, 6)
				)
					throw new ERPNextGatewayError('stale_invoice', false);
				await ctx.runMutation(internal.erpnextData.markSettlementSubmitted, {
					organizationId: args.organizationId,
					runId: claim.runId
				});
				writeStarted = true;
				payment = await gateway.createPaymentEntry({
					direction: settlement.direction,
					company: settlement.company,
					party: settlement.party,
					invoiceType: settlement.documentType,
					invoiceId: settlement.providerDocumentId,
					bankAccount: settlement.bankAccount,
					partyAccount: invoice.partyAccount,
					amount: settlement.amount,
					postingDate: new Date(settlement.settledAt).toISOString().slice(0, 10),
					remoteReference: claim.remoteReference
				});
				providerDocumentId = payment.providerDocumentId;
				await ctx.runMutation(internal.erpnextData.markSettlementSubmitted, {
					organizationId: args.organizationId,
					runId: claim.runId,
					providerDocumentId
				});
			}
			if (payment.docstatus !== 1) {
				writeStarted = true;
				payment = await gateway.submitPaymentEntry(payment);
				providerDocumentId = payment.providerDocumentId;
			}
			if (payment.docstatus !== 1) throw new Error('ERPNext did not submit the Payment Entry.');
			await ctx.runMutation(internal.erpnextData.finishSettlement, {
				organizationId: args.organizationId,
				runId: claim.runId,
				status: 'succeeded',
				providerDocumentId,
				actorId: settlement.actorId
			});
			return {
				runId: claim.runId,
				status: 'succeeded',
				providerDocumentId,
				deduplicated: false
			};
		} catch (error) {
			const errorCode = erpNextErrorCode(error);
			const ambiguous =
				writeStarted && !['invalid_credentials', 'permission_denied'].includes(errorCode);
			await ctx.runMutation(internal.erpnextData.finishSettlement, {
				organizationId: args.organizationId,
				runId: claim.runId,
				status: ambiguous ? 'ambiguous' : 'failed',
				providerDocumentId,
				errorCode,
				actorId: settlement.actorId
			});
			throw new Error(
				ambiguous
					? 'ERPNext settlement result is uncertain. Retry to reconcile by remote reference before another write.'
					: erpNextErrorMessage(error),
				{ cause: error }
			);
		}
	}
});

export const disconnect = action({
	args: {
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const scope = await ctx.runQuery(internal.erpnextData.authorizeOrganization, {
			organizationId: args.organizationId
		});
		await ctx.runMutation(internal.erpnextData.disconnect, {
			...args,
			actorId: scope.actorId
		});
		return null;
	}
});
