import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { decimalToUnits, normalizeDecimal, unitsToDecimal } from '../lib/domain';
import { generateCapabilityToken, hashCapabilityToken } from '../lib/capability-token';
import { appendAudit } from './lib/audit';
import { prepareSourceJournalReversal } from './lib/accounting';

const statusValidator = v.union(
	v.literal('provisioning'),
	v.literal('issued'),
	v.literal('partiallyPaid'),
	v.literal('paid'),
	v.literal('overdue'),
	v.literal('void'),
	v.literal('failed')
);
const lineItemValidator = v.object({
	description: v.string(),
	quantity: v.string(),
	unitAmount: v.string()
});
const invoiceValidator = v.object({
	_id: v.id('invoices'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	invoiceNumber: v.string(),
	customerName: v.string(),
	customerEmail: v.optional(v.string()),
	asset: v.literal('USDC'),
	amount: v.string(),
	paidAmount: v.string(),
	dueAt: v.number(),
	status: statusValidator,
	lineItems: v.array(lineItemValidator),
	notes: v.optional(v.string()),
	treasuryWalletId: v.id('wallets'),
	collectionWalletId: v.optional(v.id('wallets')),
	publicTokenHash: v.string(),
	publicTokenCreatedAt: v.number(),
	createdBy: v.id('users'),
	createdAt: v.number(),
	updatedAt: v.number()
});

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(
		v.object({ invoice: invoiceValidator, collectionAddress: v.union(v.null(), v.string()) })
	),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'invoice:read');
		const invoices = await ctx.db
			.query('invoices')
			.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.take(250);
		return Promise.all(
			invoices.map(async (invoice) => ({
				invoice,
				collectionAddress: invoice.collectionWalletId
					? ((await ctx.db.get(invoice.collectionWalletId))?.address ?? null)
					: null
			}))
		);
	}
});

export const createAndIssue = mutation({
	args: {
		organizationId: v.id('organizations'),
		invoiceNumber: v.string(),
		customerName: v.string(),
		customerEmail: v.optional(v.string()),
		dueAt: v.number(),
		lineItems: v.array(lineItemValidator),
		notes: v.optional(v.string()),
		treasuryWalletId: v.id('wallets')
	},
	returns: v.object({ invoiceId: v.id('invoices'), publicToken: v.string() }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'invoice:manage');
		const invoiceNumber = args.invoiceNumber.trim();
		const customerName = args.customerName.trim();
		if (!invoiceNumber || invoiceNumber.length > 50)
			throw new Error('Invoice number must be 1 to 50 characters.');
		if (!customerName || customerName.length > 120)
			throw new Error('Customer name must be 1 to 120 characters.');
		if (!Number.isFinite(args.dueAt) || args.dueAt < Date.now() - 86_400_000)
			throw new Error('Invoice due date is invalid.');
		if (args.lineItems.length < 1 || args.lineItems.length > 50)
			throw new Error('Add 1 to 50 invoice line items.');
		const duplicate = await ctx.db
			.query('invoices')
			.withIndex('by_org_number', (q) =>
				q.eq('organizationId', args.organizationId).eq('invoiceNumber', invoiceNumber)
			)
			.unique();
		if (duplicate) throw new Error('Invoice number already exists in this organization.');
		const treasuryWallet = await ctx.db.get(args.treasuryWalletId);
		assertOrgScoped(treasuryWallet, args.organizationId);
		if (treasuryWallet.purpose === 'collection')
			throw new Error('Select a treasury wallet, not a collection wallet.');
		const [quorum, policies, principals] = await Promise.all([
			ctx.db
				.query('reviewerQuorums')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.unique(),
			ctx.db
				.query('policies')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100),
			ctx.db
				.query('servicePrincipals')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(100)
		]);
		const ownerPolicy = policies.find(
			(policy) => policy.kind === 'owner' && policy.status === 'active'
		);
		const principal = principals.find((item) => item.status === 'active');
		if (!quorum || !ownerPolicy || !principal)
			throw new Error(
				'Invoice collection requires a verified quorum, owner policy, and configured Ratib automation signer.'
			);
		let totalUnits = 0n;
		const lineItems = args.lineItems.map((item) => {
			const description = item.description.trim();
			if (!description || description.length > 200)
				throw new Error('Each line item needs a description up to 200 characters.');
			const quantity = normalizeDecimal(item.quantity, 0);
			if (BigInt(quantity) < 1n)
				throw new Error('Line item quantity must be a positive whole number.');
			const unitAmount = normalizeDecimal(item.unitAmount, 6);
			const unitAmountUnits = decimalToUnits(unitAmount, 6);
			if (unitAmountUnits < 1n) throw new Error('Line item amount must be greater than zero.');
			totalUnits += BigInt(quantity) * unitAmountUnits;
			return { description, quantity, unitAmount };
		});
		const publicToken = generateCapabilityToken();
		const publicTokenHash = await hashCapabilityToken(publicToken);
		const now = Date.now();
		const invoiceId = await ctx.db.insert('invoices', {
			organizationId: args.organizationId,
			invoiceNumber,
			customerName,
			customerEmail: args.customerEmail?.trim().toLowerCase() || undefined,
			asset: 'USDC',
			amount: unitsToDecimal(totalUnits.toString(), 6),
			paidAmount: '0',
			dueAt: args.dueAt,
			status: 'provisioning',
			lineItems,
			notes: args.notes?.trim() || undefined,
			treasuryWalletId: treasuryWallet._id,
			publicTokenHash,
			publicTokenCreatedAt: now,
			createdBy: user._id,
			createdAt: now,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'invoice.created',
			resourceType: 'invoice',
			resourceId: invoiceId,
			correlationId: `invoice:${invoiceId}`,
			metadata: {
				invoiceNumber,
				customerName,
				amount: unitsToDecimal(totalUnits.toString(), 6),
				asset: 'USDC'
			}
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.provisionInvoiceCollection, {
			organizationId: args.organizationId,
			invoiceId,
			name: `Invoice ${invoiceNumber}`,
			ownerQuorumId: quorum.privyOwnerId,
			ownerPolicyId: ownerPolicy.privyPolicyId,
			automationSignerId: principal.privyAuthorizationKeyId,
			servicePrincipalId: principal._id,
			treasuryDestination: treasuryWallet.address,
			actorId: user.privyDid
		});
		return { invoiceId, publicToken };
	}
});

export const rotatePublicLink = mutation({
	args: { organizationId: v.id('organizations'), invoiceId: v.id('invoices') },
	returns: v.object({ publicToken: v.string() }),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'invoice:manage');
		const invoice = await ctx.db.get(args.invoiceId);
		assertOrgScoped(invoice, args.organizationId);
		if (invoice.status === 'void') throw new Error('Cannot rotate a void invoice link.');
		const publicToken = generateCapabilityToken();
		await ctx.db.patch(invoice._id, {
			publicTokenHash: await hashCapabilityToken(publicToken),
			publicTokenCreatedAt: Date.now(),
			updatedAt: Date.now()
		});
		return { publicToken };
	}
});

export const voidInvoice = mutation({
	args: { organizationId: v.id('organizations'), invoiceId: v.id('invoices') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'invoice:manage');
		const invoice = await ctx.db.get(args.invoiceId);
		assertOrgScoped(invoice, args.organizationId);
		if (invoice.status === 'paid') throw new Error('A paid invoice cannot be voided.');
		const reversalJournalId = await prepareSourceJournalReversal(ctx, {
			organizationId: args.organizationId,
			sourceKey: `invoice:${invoice._id}:issued`,
			reason: `Invoice ${invoice.invoiceNumber} voided`,
			preparedBy: user._id
		});
		await ctx.db.patch(invoice._id, { status: 'void', updatedAt: Date.now() });
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'invoice.voided',
			resourceType: 'invoice',
			resourceId: invoice._id,
			correlationId: `invoice:${invoice._id}`,
			metadata: reversalJournalId ? { reversalJournalId } : {}
		});
		return null;
	}
});

// This endpoint is capability-scoped: only the SHA-256 hash of a 256-bit link token is stored.
export const getPublic = query({
	args: { tokenHash: v.string() },
	returns: v.union(
		v.null(),
		v.object({
			organizationName: v.string(),
			invoiceNumber: v.string(),
			customerName: v.string(),
			asset: v.literal('USDC'),
			amount: v.string(),
			paidAmount: v.string(),
			dueAt: v.number(),
			status: statusValidator,
			lineItems: v.array(lineItemValidator),
			notes: v.optional(v.string()),
			collectionAddress: v.union(v.null(), v.string()),
			chainId: v.literal(84532)
		})
	),
	handler: async (ctx, args) => {
		if (!/^[a-f0-9]{64}$/.test(args.tokenHash)) return null;
		const invoice = await ctx.db
			.query('invoices')
			.withIndex('by_public_token', (q) => q.eq('publicTokenHash', args.tokenHash))
			.unique();
		if (!invoice) return null;
		const [organization, wallet] = await Promise.all([
			ctx.db.get(invoice.organizationId),
			invoice.collectionWalletId ? ctx.db.get(invoice.collectionWalletId) : null
		]);
		if (!organization?.active) return null;
		return {
			organizationName: organization.name,
			invoiceNumber: invoice.invoiceNumber,
			customerName: invoice.customerName,
			asset: invoice.asset,
			amount: invoice.amount,
			paidAmount: invoice.paidAmount,
			dueAt: invoice.dueAt,
			status: invoice.status,
			lineItems: invoice.lineItems,
			notes: invoice.notes,
			collectionAddress: wallet?.address ?? null,
			chainId: 84532 as const
		};
	}
});
