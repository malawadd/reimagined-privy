import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api, internal } from '../src/convex/_generated/api';
import type { Id } from '../src/convex/_generated/dataModel';
import type { DeveloperApiScope } from '../src/lib/developer-api';

const modules = import.meta.glob('../src/convex/**/*.ts');
const publicJwk = {
	kty: 'EC',
	crv: 'P-256',
	x: 'us5l6UmHdG5WUyYH0w8R4sY9p7xqAC4a4Gq8jEteq_s',
	y: 'QGn7jdpQ9v3Q4QyiK7ZUFuG95W7sCLd3OW5s9UQYJGs'
};

async function setup(scopes: DeveloperApiScope[] = ['operations:read', 'payments:create']) {
	const t = convexTest(schema, modules);
	const owner = t.withIdentity({
		subject: 'did:privy:developer-owner',
		email: 'owner@example.com'
	});
	const userId = await owner.mutation(api.users.syncCurrent, {});
	const ids = await t.run(async (ctx) => {
		const organizationId = await ctx.db.insert('organizations', {
			name: 'Developer Co',
			slug: 'developer-co',
			createdByUserId: userId,
			active: true
		});
		await ctx.db.insert('memberships', { organizationId, userId, role: 'owner', status: 'active' });
		const walletId = await ctx.db.insert('wallets', {
			organizationId,
			privyWalletId: 'wallet_developer',
			name: 'Developer treasury',
			address: '0x0000000000000000000000000000000000000001',
			chainType: 'ethereum',
			chainId: 84532,
			ownerQuorumId: 'quorum_developer',
			signerIds: [],
			policyIds: [],
			syncVersion: 1,
			syncedAt: Date.now(),
			purpose: 'treasury'
		});
		return { organizationId, walletId, userId };
	});
	const created = await owner.mutation(api.developerAccounts.create, {
		organizationId: ids.organizationId,
		name: 'ERP connector',
		purpose: 'Approval-bound payments',
		scopes,
		walletIds: [ids.walletId],
		keyId: 'rcred_abcdefghijklmnop',
		publicJwk
	});
	const account = (
		await owner.query(api.developerAccounts.list, {
			organizationId: ids.organizationId
		})
	)[0];
	return { t, owner, ...ids, created, account };
}

describe('developer API Convex boundary', () => {
	it('creates separately scoped machine identities and rejects cross-tenant reads', async () => {
		const { t, owner, organizationId, account } = await setup();
		expect(account.scopes).toEqual(['operations:read', 'payments:create']);
		expect(account).not.toHaveProperty('privyAuthorizationKeyId');
		const outsider = t.withIdentity({
			subject: 'did:privy:outsider',
			email: 'outside@example.com'
		});
		await outsider.mutation(api.users.syncCurrent, {});
		await expect(outsider.query(api.developerAccounts.list, { organizationId })).rejects.toThrow(
			'Organization access denied'
		);
		expect(await owner.query(api.developerAccounts.list, { organizationId })).toHaveLength(1);
	});

	it('rejects nonce replay atomically', async () => {
		const { t } = await setup();
		await t.mutation(internal.developerApiData.claimRequest, {
			keyId: 'rcred_abcdefghijklmnop',
			nonceHash: 'nonce-hash',
			bucket: 'read'
		});
		await expect(
			t.mutation(internal.developerApiData.claimRequest, {
				keyId: 'rcred_abcdefghijklmnop',
				nonceHash: 'nonce-hash',
				bucket: 'read'
			})
		).rejects.toThrow('request_replayed');
	});

	it('deduplicates identical payments, rejects changed bodies, and always requires Privy approval', async () => {
		const { t, organizationId, walletId, account } = await setup();
		const args = {
			organizationId,
			serviceAccountId: account._id,
			credentialId: account.credentials[0]._id,
			requestId: 'req_test',
			idempotencyKey: 'payment_123456789',
			requestFingerprint: 'fingerprint-a',
			walletId,
			asset: 'USDC' as const,
			amount: '2.50',
			destination: '0x0000000000000000000000000000000000000002',
			reference: 'Invoice 42'
		};
		await expect(
			t.mutation(internal.developerApiData.createPayment, {
				...args,
				idempotencyKey: 'payment_zero_123456',
				requestFingerprint: 'fingerprint-zero',
				amount: '0.000000'
			})
		).rejects.toThrow('invalid_amount');
		const first = await t.mutation(internal.developerApiData.createPayment, args);
		const replay = await t.mutation(internal.developerApiData.createPayment, args);
		expect(first.deduplicated).toBe(false);
		expect(replay.deduplicated).toBe(true);
		expect(replay.operation.id).toBe(first.operation.id);
		await expect(
			t.mutation(internal.developerApiData.createPayment, {
				...args,
				requestFingerprint: 'fingerprint-b',
				amount: '3.50'
			})
		).rejects.toThrow('idempotency_key_reused');
		const stored = await t.run((ctx) => ctx.db.get(first.operation.id as Id<'operations'>));
		expect(stored?.approvalPath).toBe('privyIntent');
		expect(stored?.createdBy).toBeUndefined();
		const audit = await t.run((ctx) =>
			ctx.db
				.query('auditEvents')
				.withIndex('by_org_time', (q) => q.eq('organizationId', organizationId))
				.collect()
		);
		expect(audit.some((event) => event.actorType === 'servicePrincipal')).toBe(true);
	});

	it('applies wallet restrictions to finance resources, audit evidence, and report aggregates', async () => {
		const { t, organizationId, walletId, userId } = await setup([
			'invoices:read',
			'batches:read',
			'payroll:read',
			'audit:read'
		]);
		const ids = await t.run(async (ctx) => {
			const now = Date.now();
			const otherWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_other',
				name: 'Other treasury',
				address: '0x0000000000000000000000000000000000000011',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_other',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: now,
				purpose: 'treasury'
			});
			const allowedPayableId = await ctx.db.insert('payables', {
				organizationId,
				type: 'bill',
				reference: 'ALLOWED',
				payeeName: 'Allowed vendor',
				destination: '0x0000000000000000000000000000000000000021',
				asset: 'USDC',
				amount: '2',
				dueAt: now,
				status: 'pendingApproval',
				sourceWalletId: walletId,
				createdBy: userId,
				createdAt: now,
				updatedAt: now
			});
			await ctx.db.insert('payables', {
				organizationId,
				type: 'bill',
				reference: 'OTHER',
				payeeName: 'Other vendor',
				destination: '0x0000000000000000000000000000000000000022',
				asset: 'USDC',
				amount: '100',
				dueAt: now,
				status: 'approved',
				sourceWalletId: otherWalletId,
				createdBy: userId,
				createdAt: now,
				updatedAt: now
			});
			const unscopedPayableId = await ctx.db.insert('payables', {
				organizationId,
				type: 'expense',
				reference: 'UNSCOPED',
				payeeName: 'Draft vendor',
				destination: '0x0000000000000000000000000000000000000023',
				asset: 'USDC',
				amount: '200',
				dueAt: now,
				status: 'draft',
				createdBy: userId,
				createdAt: now,
				updatedAt: now
			});
			for (const [suffix, treasuryWalletId] of [
				['ALLOWED', walletId],
				['OTHER', otherWalletId]
			] as const) {
				await ctx.db.insert('invoices', {
					organizationId,
					invoiceNumber: `INV-${suffix}`,
					customerName: `${suffix} customer`,
					asset: 'USDC',
					amount: suffix === 'ALLOWED' ? '3' : '300',
					paidAmount: '0',
					dueAt: now,
					status: 'issued',
					lineItems: [{ description: 'Service', quantity: '1', unitAmount: '3' }],
					treasuryWalletId,
					publicTokenHash: `hash-${suffix}`,
					publicTokenCreatedAt: now,
					createdBy: userId,
					createdAt: now,
					updatedAt: now
				});
			}
			for (const [type, sourceWalletId, name] of [
				['batch', walletId, 'Allowed batch'],
				['batch', otherWalletId, 'Other batch'],
				['payroll', walletId, 'Allowed payroll'],
				['payroll', otherWalletId, 'Other payroll']
			] as const) {
				await ctx.db.insert('paymentBatches', {
					organizationId,
					type,
					name,
					asset: 'USDC',
					totalAmount: '1',
					itemCount: 1,
					status: 'draft',
					sourceWalletId,
					createdBy: userId,
					createdAt: now,
					updatedAt: now
				});
			}
			for (const [resourceType, resourceId] of [
				['payable', String(allowedPayableId)],
				['payable', String(unscopedPayableId)],
				['organization', String(organizationId)]
			] as const) {
				await ctx.db.insert('auditEvents', {
					organizationId,
					actorType: 'user',
					actorId: String(userId),
					action: 'test.created',
					resourceType,
					resourceId,
					correlationId: `test:${resourceType}:${resourceId}`,
					privyIds: [],
					metadata: {},
					occurredAt: now
				});
			}
			return { allowedPayableId };
		});

		const restriction = { organizationId, walletIds: [walletId] };
		const [payouts, invoices, batches, payroll, audit, report] = await Promise.all([
			t.query(internal.developerApiData.listPayouts, restriction),
			t.query(internal.developerApiData.listInvoices, restriction),
			t.query(internal.developerApiData.listBatches, restriction),
			t.query(internal.developerApiData.listPayroll, restriction),
			t.query(internal.developerApiData.listAudit, restriction),
			t.query(internal.developerApiData.getReport, restriction)
		]);
		expect(payouts.map((item) => item.id)).toEqual([ids.allowedPayableId]);
		expect(invoices.map((item) => item.invoiceNumber)).toEqual(['INV-ALLOWED']);
		expect(batches.map((item) => item.name)).toEqual(['Allowed batch']);
		expect(payroll.map((item) => item.name)).toEqual(['Allowed payroll']);
		expect(audit).toHaveLength(1);
		expect(audit[0].resourceId).toBe(String(ids.allowedPayableId));
		expect(report).toMatchObject({
			outstandingReceivablesUsdc: '3',
			openPayablesUsdc: '2',
			completeness: { complete: true, truncated: false, walletRestrictionApplied: true }
		});
	});

	it('marks capped finance aggregates as incomplete instead of presenting partial totals as final', async () => {
		const { t, organizationId, walletId, userId } = await setup(['audit:read']);
		await t.run(async (ctx) => {
			const now = Date.now();
			for (let index = 0; index < 501; index += 1) {
				await ctx.db.insert('payables', {
					organizationId,
					type: 'bill',
					reference: `CAP-${index}`,
					payeeName: 'Capacity vendor',
					destination: '0x0000000000000000000000000000000000000031',
					asset: 'USDC',
					amount: '1',
					dueAt: now,
					status: 'approved',
					sourceWalletId: walletId,
					createdBy: userId,
					createdAt: now,
					updatedAt: now
				});
			}
		});
		const report = await t.query(internal.developerApiData.getReport, {
			organizationId,
			walletIds: [walletId]
		});
		expect(report.openPayablesUsdc).toBe('500');
		expect(report.completeness).toMatchObject({
			complete: false,
			truncated: true,
			truncatedSources: ['payables'],
			sourceRows: { payables: 500 },
			sourceLimits: { payables: 500 }
		});
	});

	it('creates and replays webhook deliveries with organization-scoped idempotency', async () => {
		const { t, organizationId, account } = await setup(['webhooks:manage']);
		const createArgs = {
			organizationId,
			serviceAccountId: account._id,
			requestId: 'req_webhook_create',
			idempotencyKey: 'webhook_create_123',
			requestFingerprint: 'fingerprint-webhook',
			url: 'https://events.example.com/ratib',
			eventTypes: ['operation.succeeded']
		};
		const created = await t.mutation(internal.developerApiData.createWebhookEndpoint, createArgs);
		const duplicate = await t.mutation(internal.developerApiData.createWebhookEndpoint, createArgs);
		expect(created.deduplicated).toBe(false);
		expect(duplicate).toMatchObject({ deduplicated: true, endpoint: { id: created.endpoint.id } });
		const deliveryId = await t.run(async (ctx) => {
			const now = Date.now();
			const eventId = await ctx.db.insert('developerEvents', {
				organizationId,
				eventType: 'operation.succeeded',
				aggregateType: 'operation',
				aggregateId: 'operation-test',
				aggregateSequence: 1,
				schemaVersion: 1,
				data: { status: 'succeeded' },
				occurredAt: now
			});
			return ctx.db.insert('developerWebhookDeliveries', {
				organizationId,
				endpointId: created.endpoint.id,
				eventId,
				attempt: 1,
				status: 'failed',
				deliveryKey: `${created.endpoint.id}:${eventId}:1`,
				errorCode: 'endpoint_non_2xx',
				createdAt: now,
				updatedAt: now
			});
		});
		const replayArgs = {
			organizationId,
			serviceAccountId: account._id,
			requestId: 'req_webhook_replay',
			idempotencyKey: 'webhook_replay_123',
			requestFingerprint: 'fingerprint-replay',
			deliveryId: String(deliveryId)
		};
		const replay = await t.mutation(internal.developerApiData.replayWebhookDelivery, replayArgs);
		const replayDuplicate = await t.mutation(
			internal.developerApiData.replayWebhookDelivery,
			replayArgs
		);
		expect(replay).toMatchObject({ deduplicated: false, delivery: { attempt: 2 } });
		expect(replayDuplicate).toMatchObject({
			deduplicated: true,
			delivery: { id: replay.delivery.id }
		});
	});

	it('recovers expired webhook claims and ignores completion from the old lease', async () => {
		const { t, organizationId, account } = await setup(['webhooks:manage']);
		const created = await t.mutation(internal.developerApiData.createWebhookEndpoint, {
			organizationId,
			serviceAccountId: account._id,
			requestId: 'req_webhook_lease',
			idempotencyKey: 'webhook_lease_123',
			requestFingerprint: 'fingerprint-webhook-lease',
			url: 'https://events.example.com/ratib',
			eventTypes: ['operation.succeeded']
		});
		const staleClaimedAt = Date.now() - 5 * 60_000;
		const deliveryId = await t.run(async (ctx) => {
			const eventId = await ctx.db.insert('developerEvents', {
				organizationId,
				eventType: 'operation.succeeded',
				aggregateType: 'operation',
				aggregateId: 'operation-stale',
				aggregateSequence: 1,
				schemaVersion: 1,
				data: { status: 'succeeded' },
				occurredAt: staleClaimedAt
			});
			return ctx.db.insert('developerWebhookDeliveries', {
				organizationId,
				endpointId: created.endpoint.id,
				eventId,
				attempt: 1,
				status: 'claimed',
				deliveryKey: `${created.endpoint.id}:${eventId}:1`,
				claimedAt: staleClaimedAt,
				createdAt: staleClaimedAt,
				updatedAt: staleClaimedAt
			});
		});
		expect(await t.mutation(internal.developerWebhookState.recoverStaleClaims, {})).toEqual({
			recovered: 1,
			failed: 0
		});
		await t.mutation(internal.developerWebhookState.complete, {
			deliveryId,
			leaseClaimedAt: staleClaimedAt,
			succeeded: true,
			responseStatus: 200
		});
		const recovered = await t.run((ctx) => ctx.db.get(deliveryId));
		expect(recovered).toMatchObject({
			status: 'retrying',
			attempt: 2,
			errorCode: 'delivery_lease_expired'
		});
		expect(recovered?.claimedAt).toBeUndefined();
	});
});
