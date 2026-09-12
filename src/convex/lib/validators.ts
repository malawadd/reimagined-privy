import { v } from 'convex/values';

export const orgRoleValidator = v.union(
	v.literal('owner'),
	v.literal('admin'),
	v.literal('operator'),
	v.literal('approver'),
	v.literal('auditor')
);

export const userDocumentValidator = v.object({
	_id: v.id('users'),
	_creationTime: v.number(),
	privyDid: v.string(),
	email: v.optional(v.string()),
	name: v.optional(v.string()),
	lastSeenAt: v.number()
});

export const organizationDocumentValidator = v.object({
	_id: v.id('organizations'),
	_creationTime: v.number(),
	name: v.string(),
	slug: v.string(),
	createdByUserId: v.id('users'),
	active: v.boolean(),
	pilotUseCase: v.optional(v.string()),
	pilotContactEmail: v.optional(v.string()),
	requestedAt: v.optional(v.number()),
	approvedAt: v.optional(v.number()),
	approvedByPrivyDid: v.optional(v.string())
});

export const membershipDocumentValidator = v.object({
	_id: v.id('memberships'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	userId: v.id('users'),
	role: orgRoleValidator,
	status: v.union(v.literal('active'), v.literal('suspended'))
});

export const operationStatusValidator = v.union(
	v.literal('draft'),
	v.literal('queued'),
	v.literal('pendingApproval'),
	v.literal('executing'),
	v.literal('pendingConfirmation'),
	v.literal('succeeded'),
	v.literal('rejected'),
	v.literal('expired'),
	v.literal('failed'),
	v.literal('cancelled')
);

export const operationDocumentValidator = v.object({
	_id: v.id('operations'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	kind: v.union(
		v.literal('payment'),
		v.literal('treasuryTransfer'),
		v.literal('walletUpdate'),
		v.literal('quorumUpdate'),
		v.literal('policyUpdate'),
		v.literal('automationRun')
	),
	status: operationStatusValidator,
	approvalPath: v.optional(v.union(v.literal('automationSigner'), v.literal('privyIntent'))),
	asset: v.optional(v.union(v.literal('ETH'), v.literal('USDC'))),
	amount: v.optional(v.string()),
	destination: v.optional(v.string()),
	memo: v.optional(v.string()),
	reference: v.string(),
	requestKey: v.optional(v.string()),
	createdBy: v.optional(v.id('users')),
	sourceWalletId: v.optional(v.id('wallets')),
	automationRunId: v.optional(v.id('automationRuns')),
	sourcePayableId: v.optional(v.id('payables')),
	sourceBatchItemId: v.optional(v.id('paymentBatchItems')),
	correlationId: v.string(),
	errorCode: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number()
});

export const walletDocumentValidator = v.object({
	_id: v.id('wallets'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	privyWalletId: v.string(),
	name: v.string(),
	address: v.string(),
	chainType: v.literal('ethereum'),
	chainId: v.literal(84532),
	ownerQuorumId: v.string(),
	signerIds: v.array(v.string()),
	policyIds: v.array(v.string()),
	approvalThreshold: v.optional(v.number()),
	syncVersion: v.number(),
	syncedAt: v.number(),
	purpose: v.optional(v.union(v.literal('treasury'), v.literal('collection'))),
	invoiceId: v.optional(v.id('invoices'))
});

export const walletBalanceDocumentValidator = v.object({
	_id: v.id('walletBalances'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	walletId: v.id('wallets'),
	chainId: v.literal(84532),
	asset: v.union(v.literal('ETH'), v.literal('USDC')),
	rawValue: v.string(),
	decimals: v.number(),
	displayValue: v.string(),
	observedAt: v.number()
});

export const auditEventDocumentValidator = v.object({
	_id: v.id('auditEvents'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	actorType: v.union(
		v.literal('user'),
		v.literal('servicePrincipal'),
		v.literal('privy'),
		v.literal('system')
	),
	actorId: v.string(),
	action: v.string(),
	resourceType: v.string(),
	resourceId: v.string(),
	correlationId: v.string(),
	privyIds: v.array(v.string()),
	transactionHash: v.optional(v.string()),
	metadata: v.any(),
	occurredAt: v.number()
});

export const policyDocumentValidator = v.object({
	_id: v.id('policies'),
	_creationTime: v.number(),
	organizationId: v.id('organizations'),
	privyPolicyId: v.string(),
	name: v.string(),
	version: v.number(),
	kind: v.union(v.literal('owner'), v.literal('signerOverride'), v.literal('sweep')),
	json: v.any(),
	status: v.union(v.literal('active'), v.literal('pending'), v.literal('superseded')),
	createdAt: v.number()
});
