import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api, internal } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');

async function setup() {
	const t = convexTest(schema, modules);
	const owner = t.withIdentity({
		subject: 'did:privy:erp-owner',
		email: 'erp-owner@example.com'
	});
	const outsider = t.withIdentity({
		subject: 'did:privy:erp-outsider',
		email: 'erp-outsider@example.com'
	});
	const ownerId = await owner.mutation(api.users.syncCurrent, {});
	await outsider.mutation(api.users.syncCurrent, {});
	const { organizationId, connectionId, externalAccountId, chartAccountId } = await t.run(
		async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'ERP Test Company',
				slug: `erp-test-${crypto.randomUUID()}`,
				createdByUserId: ownerId,
				active: true
			});
			await ctx.db.insert('memberships', {
				organizationId,
				userId: ownerId,
				role: 'owner',
				status: 'active'
			});
			const now = Date.now();
			const connectionId = await ctx.db.insert('erpConnections', {
				organizationId,
				provider: 'erpnext',
				label: 'Main ERP',
				baseUrl: 'https://finance.example.com',
				credentialMode: 'saved',
				encryptedCredentials: {
					version: 1,
					iv: 'test-iv',
					ciphertext: 'secret-ciphertext',
					authTag: 'test-tag'
				},
				apiKeyHint: '...1234',
				status: 'connected',
				remoteUser: 'integration@example.com',
				remoteSiteName: 'ERP Test',
				availableCompanies: ['ERP Test'],
				selectedCompany: 'ERP Test',
				autoSyncEnabled: false,
				lastVerifiedAt: now,
				createdBy: ownerId,
				createdAt: now,
				updatedAt: now
			});
			const externalAccountId = await ctx.db.insert('erpExternalAccounts', {
				organizationId,
				connectionId,
				providerAccountId: 'Cash - ETC',
				accountName: 'Cash',
				accountNumber: '1000',
				rootType: 'Asset',
				company: 'ERP Test',
				isGroup: false,
				disabled: false,
				accountCurrency: 'USD',
				syncedAt: now
			});
			const bookId = await ctx.db.insert('accountingBooks', {
				organizationId,
				name: 'Primary book',
				functionalCurrency: 'USD',
				timezone: 'UTC',
				fiscalYearStartMonth: 1,
				status: 'active',
				createdAt: now
			});
			const chartAccountId = await ctx.db.insert('chartAccounts', {
				organizationId,
				bookId,
				code: '1000',
				name: 'Treasury cash',
				type: 'asset',
				normalBalance: 'debit',
				isPosting: true,
				active: true,
				createdAt: now
			});
			return { organizationId, connectionId, externalAccountId, chartAccountId };
		}
	);
	return {
		t,
		owner,
		outsider,
		ownerId,
		organizationId,
		connectionId,
		externalAccountId,
		chartAccountId
	};
}

describe('ERPNext integration authorization and durability', () => {
	it('returns connection metadata without exposing encrypted credentials', async () => {
		const { owner, organizationId } = await setup();
		const [connection] = await owner.query(api.erpnext.listConnections, { organizationId });
		expect(connection).toMatchObject({
			label: 'Main ERP',
			apiKeyHint: '...1234',
			status: 'connected'
		});
		expect(connection).not.toHaveProperty('encryptedCredentials');
	});

	it('denies outsiders before a transient connection can reach the provider', async () => {
		const { outsider, organizationId } = await setup();
		await expect(
			outsider.action(api.erpnextActions.testConnection, {
				organizationId,
				baseUrl: 'https://finance.example.com',
				apiKey: 'attacker-key',
				apiSecret: 'attacker-secret'
			})
		).rejects.toThrow('Organization access denied');
		await expect(outsider.query(api.erpnext.listConnections, { organizationId })).rejects.toThrow(
			'Organization access denied'
		);
	});

	it('deduplicates chart sync claims by the caller-provided request key', async () => {
		const { owner, organizationId, connectionId } = await setup();
		const args = {
			organizationId,
			connectionId,
			requestKey: 'sync_request_00000001',
			kind: 'chartOfAccounts' as const,
			initiatedBy: 'user' as const
		};
		const first = await owner.mutation(internal.erpnextData.claimSync, args);
		await owner.mutation(internal.erpnextData.markSyncSubmitted, {
			organizationId,
			connectionId,
			runId: first.runId
		});
		const replay = await owner.mutation(internal.erpnextData.claimSync, args);
		expect(first).toMatchObject({ claimed: true, status: 'claimed' });
		expect(replay).toMatchObject({ claimed: false, status: 'submitted', runId: first.runId });
	});

	it('removes saved credentials when a connection is disabled', async () => {
		const { t, owner, organizationId, connectionId } = await setup();
		await owner.action(api.erpnextActions.disconnect, { organizationId, connectionId });
		const connection = await t.run((ctx) => ctx.db.get(connectionId));
		expect(connection?.status).toBe('disabled');
		expect(connection?.encryptedCredentials).toBeUndefined();
		const events = await t.run((ctx) =>
			ctx.db
				.query('auditEvents')
				.withIndex('by_org_time', (q) => q.eq('organizationId', organizationId))
				.collect()
		);
		expect(events.some((event) => event.action === 'erp.connection_disabled')).toBe(true);
	});

	it('validates company selection and persists an organization-scoped account mapping', async () => {
		const { owner, outsider, organizationId, connectionId, externalAccountId, chartAccountId } =
			await setup();
		await expect(
			owner.mutation(api.erpnext.configureConnection, {
				organizationId,
				connectionId,
				selectedCompany: 'Unknown Company',
				autoSyncEnabled: true,
				autoSyncIntervalMinutes: 60
			})
		).rejects.toThrow('Select a company returned');
		await owner.mutation(api.erpnext.configureConnection, {
			organizationId,
			connectionId,
			selectedCompany: 'ERP Test',
			autoSyncEnabled: true,
			autoSyncIntervalMinutes: 15
		});
		await expect(
			outsider.mutation(api.erpnext.setMapping, {
				organizationId,
				connectionId,
				externalAccountId,
				chartAccountId,
				status: 'active'
			})
		).rejects.toThrow('Organization access denied');
		await owner.mutation(api.erpnext.setMapping, {
			organizationId,
			connectionId,
			externalAccountId,
			chartAccountId,
			status: 'active'
		});
		const [mapping] = await owner.query(api.erpnext.listMappings, {
			organizationId,
			connectionId
		});
		expect(mapping).toMatchObject({
			externalAccountName: 'Cash',
			chartAccountCode: '1000',
			status: 'active'
		});
	});

	it('reclaims only failed or ambiguous deterministic settlement runs', async () => {
		const { t, ownerId, organizationId, connectionId } = await setup();
		const externalDocumentId = await t.run((ctx) =>
			ctx.db.insert('erpExternalDocuments', {
				organizationId,
				connectionId,
				documentType: 'purchaseInvoice',
				providerDocumentId: 'PINV-0001',
				company: 'ERP Test',
				party: 'SUP-001',
				currency: 'USD',
				grandTotal: '10',
				outstandingAmount: '10',
				status: 'Unpaid',
				syncedAt: Date.now()
			})
		);
		const args = {
			organizationId,
			connectionId,
			sourceType: 'operation' as const,
			sourceId: 'source-operation-id',
			direction: 'pay' as const,
			externalDocumentId,
			requestedBy: ownerId
		};
		const first = await t.mutation(internal.erpnextData.claimSettlement, args);
		const concurrent = await t.mutation(internal.erpnextData.claimSettlement, args);
		expect(first.claimed).toBe(true);
		expect(concurrent).toMatchObject({ claimed: false, runId: first.runId });
		await t.mutation(internal.erpnextData.finishSettlement, {
			organizationId,
			runId: first.runId,
			status: 'ambiguous',
			errorCode: 'request_timeout',
			actorId: 'did:privy:erp-owner'
		});
		const reconcile = await t.mutation(internal.erpnextData.claimSettlement, args);
		expect(reconcile).toMatchObject({ claimed: true, status: 'claimed', runId: first.runId });
	});

	it('atomically replaces organization-scoped ERPNext master data', async () => {
		const { t, owner, organizationId, connectionId } = await setup();
		const claim = await owner.mutation(internal.erpnextData.claimSync, {
			organizationId,
			connectionId,
			requestKey: 'master_sync_00000001',
			kind: 'masterData',
			initiatedBy: 'user'
		});
		await owner.mutation(internal.erpnextData.completeReferenceSync, {
			organizationId,
			connectionId,
			runId: claim.runId,
			actorId: 'did:privy:erp-owner',
			references: [
				{
					referenceType: 'supplier',
					providerReferenceId: 'SUP-001',
					displayName: 'Supplier One',
					disabled: false
				},
				{
					referenceType: 'item',
					providerReferenceId: 'SERVICE',
					displayName: 'Services',
					disabled: false
				}
			]
		});
		const rows = await owner.query(api.erpnext.listReferenceData, {
			organizationId,
			connectionId
		});
		expect(rows.map((row) => row.providerReferenceId)).toEqual(['SUP-001', 'SERVICE']);
		const run = await t.run((ctx) => ctx.db.get(claim.runId));
		expect(run?.status).toBe('succeeded');
		expect(run?.itemCount).toBe(2);
	});

	it('records a transient foreground sync without persisting credentials or enabling schedules', async () => {
		const { t, owner, ownerId, organizationId } = await setup();
		const connectionId = await owner.mutation(internal.erpnextData.saveTransientConnection, {
			organizationId,
			baseUrl: 'https://transient.example.com',
			remoteUser: 'foreground@example.com',
			remoteSiteName: 'transient.example.com',
			availableCompanies: ['ERP Test'],
			selectedCompany: 'ERP Test',
			userId: ownerId,
			actorId: 'did:privy:erp-owner'
		});
		const connection = await t.run((ctx) => ctx.db.get(connectionId));
		expect(connection).toMatchObject({
			credentialMode: 'transient',
			autoSyncEnabled: false,
			apiKeyHint: 'Not saved'
		});
		expect(connection).not.toHaveProperty('encryptedCredentials');
		const claim = await owner.mutation(internal.erpnextData.claimSync, {
			organizationId,
			connectionId,
			requestKey: 'transient_sync_00000001',
			kind: 'chartOfAccounts',
			initiatedBy: 'user'
		});
		expect(claim).toMatchObject({ claimed: true, status: 'claimed' });
		await expect(
			owner.mutation(api.erpnext.configureConnection, {
				organizationId,
				connectionId,
				selectedCompany: 'ERP Test',
				autoSyncEnabled: true,
				autoSyncIntervalMinutes: 60
			})
		).rejects.toThrow('Background sync requires a saved credential');
	});

	it('validates draft export dependencies and deduplicates document claims', async () => {
		const { t, owner, ownerId, organizationId, connectionId, externalAccountId, chartAccountId } =
			await setup();
		await owner.mutation(api.erpnext.setMapping, {
			organizationId,
			connectionId,
			externalAccountId,
			chartAccountId,
			status: 'active'
		});
		const { supplierId, itemId, payableId } = await t.run(async (ctx) => {
			const now = Date.now();
			const supplierId = await ctx.db.insert('erpReferenceData', {
				organizationId,
				connectionId,
				referenceType: 'supplier',
				providerReferenceId: 'SUP-001',
				displayName: 'Supplier One',
				disabled: false,
				syncedAt: now
			});
			const itemId = await ctx.db.insert('erpReferenceData', {
				organizationId,
				connectionId,
				referenceType: 'item',
				providerReferenceId: 'SERVICE',
				displayName: 'Services',
				disabled: false,
				syncedAt: now
			});
			const payableId = await ctx.db.insert('payables', {
				organizationId,
				type: 'bill',
				reference: 'BILL-001',
				payeeName: 'Supplier One',
				destination: '0x0000000000000000000000000000000000000001',
				asset: 'USDC',
				amount: '125.5',
				dueAt: Date.now() + 86_400_000,
				status: 'draft',
				createdBy: ownerId,
				createdAt: now,
				updatedAt: now
			});
			return { supplierId, itemId, payableId };
		});
		const context = await owner.query(internal.erpnextData.getDocumentPushContext, {
			organizationId,
			connectionId,
			sourceType: 'payable',
			sourceId: payableId,
			partyReferenceId: supplierId,
			itemReferenceId: itemId,
			externalAccountId
		});
		expect(context).toMatchObject({
			documentType: 'purchaseInvoice',
			party: 'SUP-001',
			account: 'Cash - ETC',
			items: [{ quantity: '1', rate: '125.5' }]
		});
		const args = {
			organizationId,
			connectionId,
			sourceType: 'payable' as const,
			sourceId: payableId,
			documentType: 'purchaseInvoice' as const,
			requestedBy: ownerId
		};
		const first = await owner.mutation(internal.erpnextData.claimDocumentPush, args);
		const duplicate = await owner.mutation(internal.erpnextData.claimDocumentPush, args);
		expect(first).toMatchObject({ claimed: true, status: 'claimed' });
		expect(duplicate).toMatchObject({ claimed: false, runId: first.runId });
		await owner.mutation(internal.erpnextData.finishDocumentPush, {
			organizationId,
			runId: first.runId,
			status: 'ambiguous',
			errorCode: 'request_timeout',
			actorId: 'did:privy:erp-owner'
		});
		let cases = await t.run((ctx) =>
			ctx.db
				.query('reconciliationCases')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', organizationId).eq('status', 'open')
				)
				.collect()
		);
		expect(cases).toHaveLength(1);
		expect(cases[0]).toMatchObject({ kind: 'syncFailure', severity: 'blocking' });
		await owner.mutation(internal.erpnextData.finishDocumentPush, {
			organizationId,
			runId: first.runId,
			status: 'succeeded',
			providerDocumentId: 'PINV-0001',
			actorId: 'did:privy:erp-owner'
		});
		cases = await t.run((ctx) =>
			ctx.db
				.query('reconciliationCases')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', organizationId).eq('status', 'resolved')
				)
				.collect()
		);
		expect(cases).toHaveLength(1);
	});
});
