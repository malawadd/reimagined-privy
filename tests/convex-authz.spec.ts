import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api, internal } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');

describe('Convex tenant authorization', () => {
	it('uses the operation source wallet and refuses to cancel dispatched payments', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({
			subject: 'did:privy:wallet-owner',
			email: 'wallet@example.com'
		});
		const userId = await owner.mutation(api.users.syncCurrent, {});
		const ids = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Wallet Co',
				slug: 'wallet-co',
				createdByUserId: userId,
				active: true
			});
			await ctx.db.insert('memberships', {
				organizationId,
				userId,
				role: 'owner',
				status: 'active'
			});
			const firstWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_first',
				name: 'First',
				address: '0x0000000000000000000000000000000000000001',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now()
			});
			const sourceWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_source',
				name: 'Source',
				address: '0x0000000000000000000000000000000000000002',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now()
			});
			const operationId = await ctx.db.insert('operations', {
				organizationId,
				kind: 'payment',
				status: 'queued',
				approvalPath: 'automationSigner',
				asset: 'USDC',
				amount: '1',
				destination: '0x0000000000000000000000000000000000000003',
				reference: 'Source wallet test',
				sourceWalletId,
				createdBy: userId,
				correlationId: 'payment:test-source-wallet',
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
			return { organizationId, operationId, sourceWalletId, firstWalletId };
		});

		const bundle = await t.query(internal.privyData.getOperationBundle, {
			operationId: ids.operationId
		});
		expect(bundle.wallet?._id).toBe(ids.sourceWalletId);
		expect(bundle.wallet?._id).not.toBe(ids.firstWalletId);
		await expect(
			owner.mutation(api.operations.cancelDraft, {
				organizationId: ids.organizationId,
				operationId: ids.operationId
			})
		).rejects.toThrow('Only an undispatched draft can be cancelled');
	});

	it('denies a valid user who is not a member of the organization', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({ subject: 'did:privy:owner', email: 'owner@example.com' });
		const userId = await owner.mutation(api.users.syncCurrent, {});
		const organizationId = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Owner company',
				slug: 'owner-company',
				createdByUserId: userId,
				active: true
			});
			await ctx.db.insert('memberships', {
				organizationId,
				userId,
				role: 'owner',
				status: 'active'
			});
			return organizationId;
		});

		const outsider = t.withIdentity({
			subject: 'did:privy:outsider',
			email: 'outsider@example.com'
		});
		await outsider.mutation(api.users.syncCurrent, {});
		await expect(outsider.query(api.organizations.getActive, { organizationId })).rejects.toThrow(
			'Organization access denied'
		);
	});

	it('materializes one sweep operation when a deposit webhook is replayed', async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const userId = await ctx.db.insert('users', {
				privyDid: 'did:privy:owner',
				lastSeenAt: Date.now()
			});
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Sweep Co',
				slug: 'sweep-co',
				createdByUserId: userId,
				active: true
			});
			const principalId = await ctx.db.insert('servicePrincipals', {
				organizationId,
				name: 'Sweeper',
				purpose: 'Deposit collection',
				privyAuthorizationKeyId: 'key_test',
				status: 'active'
			});
			const walletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_source',
				name: 'Collection',
				address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_test',
				signerIds: ['key_test'],
				policyIds: ['policy_sweep'],
				syncVersion: 1,
				syncedAt: Date.now()
			});
			const automationId = await ctx.db.insert('automations', {
				organizationId,
				name: 'Sweep deposits',
				type: 'depositSweep',
				status: 'active',
				servicePrincipalId: principalId,
				sourceWalletId: walletId,
				destination: '0x0000000000000000000000000000000000000001',
				asset: 'USDC',
				policySummary: 'USDC to treasury only',
				createdBy: userId
			});
			const receiptId = await ctx.db.insert('webhookReceipts', {
				svixMessageId: 'msg_deposit_01',
				eventType: 'wallet.deposit.detected',
				payload: {
					data: { wallet_id: 'wallet_source', asset: 'USDC', amount: '12.500000' }
				},
				receivedAt: Date.now()
			});
			return { receiptId, automationId };
		});

		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		const runs = await t.run((ctx) => ctx.db.query('automationRuns').collect());
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({
			automationId: ids.automationId,
			amount: '12.5',
			sourceEventId: 'msg_deposit_01'
		});

		const first = await t.mutation(internal.automationMaterialize.createOperation, {
			runId: runs[0]._id
		});
		const replay = await t.mutation(internal.automationMaterialize.createOperation, {
			runId: runs[0]._id
		});
		expect(replay).toBe(first);
		const operations = await t.run((ctx) => ctx.db.query('operations').collect());
		expect(operations).toHaveLength(1);
	});

	it('reconciles official Privy deposit bigint units into an invoice exactly once', async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const userId = await ctx.db.insert('users', {
				privyDid: 'did:privy:invoice-owner',
				lastSeenAt: Date.now()
			});
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Invoice Co',
				slug: 'invoice-co',
				createdByUserId: userId,
				active: true
			});
			const treasuryWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_treasury',
				name: 'Treasury',
				address: '0x0000000000000000000000000000000000000001',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_test',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'treasury'
			});
			const invoiceId = await ctx.db.insert('invoices', {
				organizationId,
				invoiceNumber: 'INV-RAW-1',
				customerName: 'Customer',
				asset: 'USDC',
				amount: '20',
				paidAmount: '0',
				dueAt: Date.now() + 86_400_000,
				status: 'issued',
				lineItems: [{ description: 'Service', quantity: '1', unitAmount: '20' }],
				treasuryWalletId,
				publicTokenHash: 'a'.repeat(64),
				publicTokenCreatedAt: Date.now(),
				createdBy: userId,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
			const collectionWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_invoice',
				name: 'Invoice INV-RAW-1',
				address: '0x0000000000000000000000000000000000000002',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_test',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'collection',
				invoiceId
			});
			await ctx.db.patch(invoiceId, { collectionWalletId });
			const receiptId = await ctx.db.insert('webhookReceipts', {
				svixMessageId: 'msg_invoice_deposit',
				payloadIdempotencyKey: 'deposit-key-1',
				eventType: 'wallet.funds_deposited',
				payload: {
					type: 'wallet.funds_deposited',
					wallet_id: 'wallet_invoice',
					idempotency_key: 'deposit-key-1',
					caip2: 'eip155:84532',
					asset: { type: 'erc20', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
					amount: '12500000',
					transaction_hash: '0xabc',
					sender: '0x0000000000000000000000000000000000000003',
					recipient: '0x0000000000000000000000000000000000000002',
					block: { number: 123 }
				},
				receivedAt: Date.now()
			});
			return { invoiceId, receiptId };
		});

		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		const result = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(ids.invoiceId),
			payments: await ctx.db.query('invoicePayments').collect()
		}));
		expect(result.invoice).toMatchObject({ paidAmount: '12.5', status: 'partiallyPaid' });
		expect(result.payments).toHaveLength(1);
		expect(result.payments[0]).toMatchObject({
			amount: '12.5',
			rawAmount: '12500000',
			transactionHash: '0xabc'
		});
	});

	it('reconciles an ETH invoice deposit with 18-decimal precision exactly once', async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const userId = await ctx.db.insert('users', {
				privyDid: 'did:privy:eth-invoice-owner',
				lastSeenAt: Date.now()
			});
			const organizationId = await ctx.db.insert('organizations', {
				name: 'ETH Invoice Co',
				slug: 'eth-invoice-co',
				createdByUserId: userId,
				active: true
			});
			const treasuryWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_eth_treasury',
				name: 'Treasury',
				address: '0x0000000000000000000000000000000000000001',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_eth_invoice',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'treasury'
			});
			const invoiceId = await ctx.db.insert('invoices', {
				organizationId,
				invoiceNumber: 'INV-ETH-1',
				customerName: 'Customer',
				asset: 'ETH',
				amount: '0.0004',
				paidAmount: '0',
				dueAt: Date.now() + 86_400_000,
				status: 'issued',
				lineItems: [{ description: 'Service', quantity: '1', unitAmount: '0.0004' }],
				treasuryWalletId,
				publicTokenHash: 'b'.repeat(64),
				publicTokenCreatedAt: Date.now(),
				createdBy: userId,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
			const collectionWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_eth_invoice',
				name: 'Invoice INV-ETH-1',
				address: '0x0000000000000000000000000000000000000002',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum_eth_invoice',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now(),
				purpose: 'collection',
				invoiceId
			});
			await ctx.db.patch(invoiceId, { collectionWalletId });
			const receiptId = await ctx.db.insert('webhookReceipts', {
				svixMessageId: 'msg_eth_invoice_deposit',
				payloadIdempotencyKey: 'deposit-eth-1',
				eventType: 'wallet.funds_deposited',
				payload: {
					type: 'wallet.funds_deposited',
					wallet_id: 'wallet_eth_invoice',
					idempotency_key: 'deposit-eth-1',
					caip2: 'eip155:84532',
					asset: 'eth',
					amount: '400000000000000',
					transaction_hash: '0xethdeposit'
				},
				receivedAt: Date.now()
			});
			return { invoiceId, receiptId };
		});
		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		await t.mutation(internal.webhookProcessing.processReceipt, { receiptId: ids.receiptId });
		const result = await t.run(async (ctx) => ({
			invoice: await ctx.db.get(ids.invoiceId),
			payments: await ctx.db.query('invoicePayments').collect(),
			ledger: await ctx.db.query('ledgerEntries').collect(),
			cases: await ctx.db.query('reconciliationCases').collect()
		}));
		expect(result.invoice).toMatchObject({ paidAmount: '0.0004', status: 'paid' });
		expect(result.payments).toHaveLength(1);
		expect(result.payments[0]).toMatchObject({ asset: 'ETH', amount: '0.0004' });
		expect(result.ledger).toContainEqual(
			expect.objectContaining({ asset: 'ETH', amount: '0.0004' })
		);
		expect(result.cases).toContainEqual(
			expect.objectContaining({ kind: 'missingValuation', sourceType: 'invoicePayment' })
		);
	});

	it('accepts an invitation only for the server-verified Privy email', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({ subject: 'did:privy:invite-owner', email: 'owner@example.com' });
		const invitee = t.withIdentity({ subject: 'did:privy:invitee', email: 'Invitee@Example.com' });
		const wrongUser = t.withIdentity({ subject: 'did:privy:wrong', email: 'wrong@example.com' });
		const ownerId = await owner.mutation(api.users.syncCurrent, {});
		await invitee.mutation(api.users.syncCurrent, {});
		await wrongUser.mutation(api.users.syncCurrent, {});
		const organizationId = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Invite Co',
				slug: 'invite-co',
				createdByUserId: ownerId,
				active: true
			});
			await ctx.db.insert('memberships', {
				organizationId,
				userId: ownerId,
				role: 'owner',
				status: 'active'
			});
			return organizationId;
		});
		const invitationId = await owner.mutation(api.members.invite, {
			organizationId,
			email: '  INVITEE@example.com ',
			role: 'operator',
			walletGrants: []
		});
		await expect(
			wrongUser.mutation(api.members.acceptInvitation, { invitationId })
		).rejects.toThrow('different verified email');
		const pending = await invitee.query(api.members.pendingForCurrent, {});
		expect(pending).toHaveLength(1);
		await invitee.mutation(api.members.acceptInvitation, { invitationId });
		const rows = await owner.query(api.members.list, { organizationId });
		expect(rows).toHaveLength(2);
		expect(rows.find((row) => row.user.privyDid === 'did:privy:invitee')).toMatchObject({
			role: 'operator',
			status: 'active'
		});
	});

	it('prevents demoting or suspending the last active owner', async () => {
		const t = convexTest(schema, modules);
		const owner = t.withIdentity({ subject: 'did:privy:last-owner', email: 'last@example.com' });
		const userId = await owner.mutation(api.users.syncCurrent, {});
		const ids = await t.run(async (ctx) => {
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Owner Guard',
				slug: 'owner-guard',
				createdByUserId: userId,
				active: true
			});
			const membershipId = await ctx.db.insert('memberships', {
				organizationId,
				userId,
				role: 'owner',
				status: 'active'
			});
			return { organizationId, membershipId };
		});
		await expect(owner.mutation(api.members.changeRole, { ...ids, role: 'admin' })).rejects.toThrow(
			'at least one active owner'
		);
		await expect(owner.mutation(api.members.suspend, ids)).rejects.toThrow(
			'at least one active owner'
		);
	});

	it('limits non-owner wallet visibility to active view assignments', async () => {
		const t = convexTest(schema, modules);
		const operator = t.withIdentity({
			subject: 'did:privy:assigned-operator',
			email: 'operator@example.com'
		});
		const ids = await t.run(async (ctx) => {
			const ownerId = await ctx.db.insert('users', {
				privyDid: 'did:privy:scope-owner',
				email: 'owner@example.com',
				lastSeenAt: Date.now()
			});
			const operatorId = await ctx.db.insert('users', {
				privyDid: 'did:privy:assigned-operator',
				email: 'operator@example.com',
				lastSeenAt: Date.now()
			});
			const organizationId = await ctx.db.insert('organizations', {
				name: 'Wallet Scope',
				slug: 'wallet-scope',
				createdByUserId: ownerId,
				active: true
			});
			await ctx.db.insert('memberships', {
				organizationId,
				userId: ownerId,
				role: 'owner',
				status: 'active'
			});
			await ctx.db.insert('memberships', {
				organizationId,
				userId: operatorId,
				role: 'operator',
				status: 'active'
			});
			const visibleWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_visible',
				name: 'Visible',
				address: '0x0000000000000000000000000000000000000001',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now()
			});
			const hiddenWalletId = await ctx.db.insert('wallets', {
				organizationId,
				privyWalletId: 'wallet_hidden',
				name: 'Hidden',
				address: '0x0000000000000000000000000000000000000002',
				chainType: 'ethereum',
				chainId: 84532,
				ownerQuorumId: 'quorum',
				signerIds: [],
				policyIds: [],
				syncVersion: 1,
				syncedAt: Date.now()
			});
			await ctx.db.insert('walletAssignments', {
				organizationId,
				walletId: visibleWalletId,
				userId: operatorId,
				permissions: ['view'],
				status: 'active',
				updatedAt: Date.now()
			});
			return { organizationId, visibleWalletId, hiddenWalletId };
		});
		const visible = await operator.query(api.wallets.list, {
			organizationId: ids.organizationId
		});
		expect(visible.map((wallet) => wallet._id)).toEqual([ids.visibleWalletId]);
		await expect(
			operator.query(api.wallets.get, {
				organizationId: ids.organizationId,
				walletId: ids.hiddenWalletId
			})
		).rejects.toThrow('Wallet access denied');
	});
});
