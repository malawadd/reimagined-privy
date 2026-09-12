import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const role = v.union(
	v.literal('owner'),
	v.literal('admin'),
	v.literal('operator'),
	v.literal('approver'),
	v.literal('auditor')
);
const status = v.union(
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

export default defineSchema({
	users: defineTable({
		privyDid: v.string(),
		email: v.optional(v.string()),
		name: v.optional(v.string()),
		lastSeenAt: v.number()
	}).index('by_privy_did', ['privyDid']),
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
		createdByUserId: v.id('users'),
		active: v.boolean(),
		pilotUseCase: v.optional(v.string()),
		pilotContactEmail: v.optional(v.string()),
		requestedAt: v.optional(v.number()),
		approvedAt: v.optional(v.number()),
		approvedByPrivyDid: v.optional(v.string())
	}).index('by_slug', ['slug']),
	memberships: defineTable({
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		role,
		status: v.union(v.literal('active'), v.literal('suspended'))
	})
		.index('by_org_user', ['organizationId', 'userId'])
		.index('by_user', ['userId']),
	invitations: defineTable({
		organizationId: v.id('organizations'),
		email: v.string(),
		normalizedEmail: v.optional(v.string()),
		role,
		invitedBy: v.id('users'),
		status: v.union(
			v.literal('pending'),
			v.literal('accepted'),
			v.literal('declined'),
			v.literal('revoked')
		),
		walletGrants: v.optional(
			v.array(
				v.object({
					walletId: v.id('wallets'),
					permissions: v.array(
						v.union(
							v.literal('view'),
							v.literal('initiate'),
							v.literal('approve'),
							v.literal('manage')
						)
					)
				})
			)
		),
		expiresAt: v.number()
	})
		.index('by_org_email', ['organizationId', 'email'])
		.index('by_email_status', ['normalizedEmail', 'status']),
	provisioningRuns: defineTable({
		organizationId: v.id('organizations'),
		requestedBy: v.id('users'),
		runKey: v.string(),
		kind: v.union(v.literal('organization'), v.literal('wallet')),
		walletName: v.string(),
		purpose: v.union(v.literal('treasury'), v.literal('collection')),
		status: v.union(
			v.literal('pending'),
			v.literal('claimed'),
			v.literal('quorumCreated'),
			v.literal('policyCreated'),
			v.literal('walletCreated'),
			v.literal('succeeded'),
			v.literal('failed'),
			v.literal('ambiguous')
		),
		privyQuorumId: v.optional(v.string()),
		privyPolicyId: v.optional(v.string()),
		privyWalletId: v.optional(v.string()),
		walletId: v.optional(v.id('wallets')),
		providerReferenceId: v.string(),
		errorCode: v.optional(v.string()),
		claimedAt: v.optional(v.number()),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId', 'updatedAt'])
		.index('by_run_key', ['runKey'])
		.index('by_org_status', ['organizationId', 'status', 'updatedAt']),
	walletAssignments: defineTable({
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		userId: v.id('users'),
		permissions: v.array(
			v.union(v.literal('view'), v.literal('initiate'), v.literal('approve'), v.literal('manage'))
		),
		status: v.union(v.literal('active'), v.literal('pending'), v.literal('suspended')),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_wallet_user', ['walletId', 'userId'])
		.index('by_user', ['userId']),
	reviewerMembers: defineTable({
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		userId: v.id('users'),
		privyDid: v.string(),
		status: v.union(v.literal('active'), v.literal('pending'), v.literal('removing')),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_wallet_user', ['walletId', 'userId']),
	quorumChangeRequests: defineTable({
		organizationId: v.id('organizations'),
		operationId: v.id('operations'),
		walletId: v.id('wallets'),
		userId: v.id('users'),
		action: v.union(v.literal('add'), v.literal('remove')),
		requestedThreshold: v.number(),
		createdAt: v.number()
	})
		.index('by_operation', ['operationId'])
		.index('by_wallet_user', ['walletId', 'userId']),
	quorumThresholdChanges: defineTable({
		organizationId: v.id('organizations'),
		operationId: v.id('operations'),
		walletId: v.id('wallets'),
		previousThreshold: v.number(),
		requestedThreshold: v.number(),
		createdAt: v.number()
	}).index('by_operation', ['operationId']),
	personalWallets: defineTable({
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		privyWalletId: v.string(),
		address: v.string(),
		chainId: v.literal(84532),
		verifiedAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org_user', ['organizationId', 'userId'])
		.index('by_privy_id', ['privyWalletId']),
	payrollProfiles: defineTable({
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		eligibility: v.union(v.literal('active'), v.literal('paused')),
		destinationKind: v.optional(v.union(v.literal('personal'), v.literal('external'))),
		personalWalletId: v.optional(v.id('personalWallets')),
		externalAddress: v.optional(v.string()),
		externalVerifiedAt: v.optional(v.number()),
		updatedAt: v.number()
	})
		.index('by_org_user', ['organizationId', 'userId'])
		.index('by_org', ['organizationId']),
	walletVerificationChallenges: defineTable({
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		address: v.string(),
		nonceHash: v.string(),
		message: v.string(),
		expiresAt: v.number(),
		usedAt: v.optional(v.number())
	})
		.index('by_org_user', ['organizationId', 'userId'])
		.index('by_nonce_hash', ['nonceHash']),
	servicePrincipals: defineTable({
		organizationId: v.id('organizations'),
		name: v.string(),
		purpose: v.string(),
		privyAuthorizationKeyId: v.string(),
		status: v.union(v.literal('active'), v.literal('revoked'))
	})
		.index('by_org', ['organizationId'])
		.index('by_org_status', ['organizationId', 'status']),
	wallets: defineTable({
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
	})
		.index('by_org', ['organizationId'])
		.index('by_privy_id', ['privyWalletId'])
		.index('by_address', ['address']),
	walletBalances: defineTable({
		organizationId: v.id('organizations'),
		walletId: v.id('wallets'),
		chainId: v.literal(84532),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		rawValue: v.string(),
		decimals: v.number(),
		displayValue: v.string(),
		observedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_wallet_asset', ['walletId', 'asset']),
	policies: defineTable({
		organizationId: v.id('organizations'),
		privyPolicyId: v.string(),
		name: v.string(),
		version: v.number(),
		kind: v.union(v.literal('owner'), v.literal('signerOverride'), v.literal('sweep')),
		json: v.any(),
		status: v.union(v.literal('active'), v.literal('pending'), v.literal('superseded')),
		createdAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_privy_id', ['privyPolicyId']),
	reviewerQuorums: defineTable({
		organizationId: v.id('organizations'),
		privyOwnerId: v.string(),
		threshold: v.number(),
		reviewerCount: v.number(),
		mfaRequired: v.boolean(),
		syncedAt: v.number()
	}).index('by_org', ['organizationId']),
	recipients: defineTable({
		organizationId: v.id('organizations'),
		label: v.string(),
		address: v.string(),
		assets: v.array(v.union(v.literal('ETH'), v.literal('USDC'))),
		status: v.union(v.literal('approved'), v.literal('revoked')),
		createdBy: v.id('users')
	})
		.index('by_org', ['organizationId'])
		.index('by_org_address', ['organizationId', 'address']),
	operations: defineTable({
		organizationId: v.id('organizations'),
		kind: v.union(
			v.literal('payment'),
			v.literal('treasuryTransfer'),
			v.literal('walletUpdate'),
			v.literal('quorumUpdate'),
			v.literal('policyUpdate'),
			v.literal('automationRun')
		),
		status,
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
	})
		.index('by_org', ['organizationId'])
		.index('by_org_status', ['organizationId', 'status'])
		.index('by_status', ['status', 'updatedAt'])
		.index('by_org_request', ['organizationId', 'requestKey'])
		.index('by_correlation', ['correlationId']),
	intentSnapshots: defineTable({
		organizationId: v.id('organizations'),
		operationId: v.id('operations'),
		privyIntentId: v.string(),
		type: v.string(),
		status: v.string(),
		approvals: v.number(),
		threshold: v.number(),
		expiresAt: v.optional(v.number()),
		providerUpdatedAt: v.number(),
		raw: v.any()
	})
		.index('by_operation', ['operationId'])
		.index('by_privy_id', ['privyIntentId']),
	walletActionSnapshots: defineTable({
		organizationId: v.id('organizations'),
		operationId: v.id('operations'),
		privyWalletActionId: v.string(),
		status: v.string(),
		providerReferenceId: v.optional(v.string()),
		providerUpdatedAt: v.number(),
		raw: v.any()
	})
		.index('by_operation', ['operationId'])
		.index('by_privy_id', ['privyWalletActionId'])
		.index('by_reference', ['providerReferenceId']),
	transactionSteps: defineTable({
		organizationId: v.id('organizations'),
		operationId: v.id('operations'),
		sequence: v.number(),
		chainId: v.literal(84532),
		transactionHash: v.optional(v.string()),
		status: v.string(),
		createdAt: v.number()
	}).index('by_operation', ['operationId']),
	automations: defineTable({
		organizationId: v.id('organizations'),
		name: v.string(),
		type: v.union(v.literal('recurringPayment'), v.literal('depositSweep')),
		status: v.union(v.literal('active'), v.literal('paused')),
		servicePrincipalId: v.id('servicePrincipals'),
		schedule: v.optional(v.string()),
		sourceWalletId: v.optional(v.id('wallets')),
		destination: v.string(),
		asset: v.literal('USDC'),
		amount: v.optional(v.string()),
		nextRunAt: v.optional(v.number()),
		policySummary: v.string(),
		createdBy: v.id('users')
	})
		.index('by_org', ['organizationId'])
		.index('by_source_wallet', ['sourceWalletId'])
		.index('by_due', ['status', 'nextRunAt']),
	invoices: defineTable({
		organizationId: v.id('organizations'),
		invoiceNumber: v.string(),
		customerName: v.string(),
		customerEmail: v.optional(v.string()),
		asset: v.literal('USDC'),
		amount: v.string(),
		paidAmount: v.string(),
		dueAt: v.number(),
		status: v.union(
			v.literal('provisioning'),
			v.literal('issued'),
			v.literal('partiallyPaid'),
			v.literal('paid'),
			v.literal('overdue'),
			v.literal('void'),
			v.literal('failed')
		),
		lineItems: v.array(
			v.object({ description: v.string(), quantity: v.string(), unitAmount: v.string() })
		),
		notes: v.optional(v.string()),
		treasuryWalletId: v.id('wallets'),
		collectionWalletId: v.optional(v.id('wallets')),
		publicTokenHash: v.string(),
		publicTokenCreatedAt: v.number(),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_org_number', ['organizationId', 'invoiceNumber'])
		.index('by_status_due', ['status', 'dueAt'])
		.index('by_public_token', ['publicTokenHash']),
	invoicePayments: defineTable({
		organizationId: v.id('organizations'),
		invoiceId: v.id('invoices'),
		walletId: v.id('wallets'),
		webhookReceiptId: v.id('webhookReceipts'),
		asset: v.literal('USDC'),
		amount: v.string(),
		rawAmount: v.string(),
		transactionHash: v.string(),
		sender: v.string(),
		blockNumber: v.optional(v.number()),
		receivedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_invoice', ['invoiceId'])
		.index('by_receipt', ['webhookReceiptId']),
	payables: defineTable({
		organizationId: v.id('organizations'),
		type: v.union(v.literal('bill'), v.literal('expense')),
		reference: v.string(),
		payeeName: v.string(),
		recipientId: v.optional(v.id('recipients')),
		destination: v.string(),
		asset: v.literal('USDC'),
		amount: v.string(),
		dueAt: v.number(),
		category: v.optional(v.string()),
		memo: v.optional(v.string()),
		receiptStorageId: v.optional(v.id('_storage')),
		status: v.union(
			v.literal('draft'),
			v.literal('paymentQueued'),
			v.literal('paid'),
			v.literal('failed'),
			v.literal('void')
		),
		operationId: v.optional(v.id('operations')),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_operation', ['operationId'])
		.index('by_org_reference', ['organizationId', 'reference']),
	paymentBatches: defineTable({
		organizationId: v.id('organizations'),
		type: v.union(v.literal('batch'), v.literal('payroll')),
		name: v.string(),
		asset: v.literal('USDC'),
		totalAmount: v.string(),
		itemCount: v.number(),
		status: v.union(
			v.literal('queued'),
			v.literal('processing'),
			v.literal('completed'),
			v.literal('failed')
		),
		sourceWalletId: v.id('wallets'),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_org', ['organizationId']),
	paymentBatchItems: defineTable({
		organizationId: v.id('organizations'),
		batchId: v.id('paymentBatches'),
		label: v.string(),
		recipientId: v.optional(v.id('recipients')),
		destination: v.string(),
		amount: v.string(),
		memo: v.optional(v.string()),
		status: v.union(
			v.literal('queued'),
			v.literal('pendingApproval'),
			v.literal('processing'),
			v.literal('succeeded'),
			v.literal('failed')
		),
		operationId: v.optional(v.id('operations')),
		requestKey: v.string()
	})
		.index('by_batch', ['batchId'])
		.index('by_operation', ['operationId']),
	ledgerEntries: defineTable({
		organizationId: v.id('organizations'),
		sourceKey: v.string(),
		sourceType: v.union(v.literal('operation'), v.literal('invoicePayment')),
		sourceId: v.string(),
		account: v.string(),
		direction: v.union(v.literal('debit'), v.literal('credit')),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		amount: v.string(),
		transactionHash: v.optional(v.string()),
		occurredAt: v.number(),
		createdAt: v.number()
	})
		.index('by_org_time', ['organizationId', 'occurredAt'])
		.index('by_source_account', ['sourceKey', 'account']),
	automationRuns: defineTable({
		organizationId: v.id('organizations'),
		automationId: v.id('automations'),
		runKey: v.string(),
		amount: v.optional(v.string()),
		sourceEventId: v.optional(v.string()),
		scheduledFor: v.optional(v.number()),
		status: v.union(
			v.literal('pending'),
			v.literal('claimed'),
			v.literal('submitted'),
			v.literal('succeeded'),
			v.literal('failed'),
			v.literal('ambiguous')
		),
		claimedAt: v.optional(v.number()),
		providerReferenceId: v.string(),
		operationId: v.optional(v.id('operations')),
		updatedAt: v.number()
	})
		.index('by_run_key', ['runKey'])
		.index('by_automation', ['automationId', 'updatedAt'])
		.index('by_org_status', ['organizationId', 'status', 'updatedAt'])
		.index('by_status', ['status', 'updatedAt']),
	webhookReceipts: defineTable({
		svixMessageId: v.string(),
		payloadIdempotencyKey: v.optional(v.string()),
		eventType: v.string(),
		payload: v.any(),
		receivedAt: v.number(),
		processedAt: v.optional(v.number()),
		processingError: v.optional(v.string())
	})
		.index('by_svix_id', ['svixMessageId'])
		.index('by_payload_key', ['payloadIdempotencyKey']),
	auditEvents: defineTable({
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
	})
		.index('by_org_time', ['organizationId', 'occurredAt'])
		.index('by_correlation', ['correlationId'])
});
