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
	payoutDestinationVersions: defineTable({
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		version: v.number(),
		kind: v.union(v.literal('personal'), v.literal('external')),
		address: v.string(),
		personalWalletId: v.optional(v.id('personalWallets')),
		verifiedAt: v.number(),
		status: v.union(v.literal('active'), v.literal('superseded')),
		createdAt: v.number()
	})
		.index('by_org_user', ['organizationId', 'userId'])
		.index('by_org_user_status', ['organizationId', 'userId', 'status']),
	compensationProfiles: defineTable({
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		employeeCode: v.optional(v.string()),
		department: v.optional(v.string()),
		baseAmount: v.string(),
		denominationCurrency: v.string(),
		payFrequency: v.union(
			v.literal('weekly'),
			v.literal('biweekly'),
			v.literal('semimonthly'),
			v.literal('monthly'),
			v.literal('adhoc')
		),
		status: v.union(v.literal('active'), v.literal('superseded')),
		version: v.number(),
		effectiveFrom: v.string(),
		effectiveTo: v.optional(v.string()),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org_user', ['organizationId', 'userId'])
		.index('by_org_status', ['organizationId', 'status']),
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
	developerServiceAccounts: defineTable({
		organizationId: v.id('organizations'),
		name: v.string(),
		purpose: v.string(),
		scopes: v.array(
			v.union(
				v.literal('org:read'),
				v.literal('wallets:read'),
				v.literal('operations:read'),
				v.literal('payments:create'),
				v.literal('invoices:read'),
				v.literal('batches:read'),
				v.literal('payroll:read'),
				v.literal('audit:read'),
				v.literal('webhooks:manage')
			)
		),
		walletIds: v.array(v.id('wallets')),
		status: v.union(v.literal('active'), v.literal('revoked')),
		createdBy: v.id('users'),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()),
		revokedAt: v.optional(v.number()),
		lastUsedAt: v.optional(v.number())
	})
		.index('by_org', ['organizationId'])
		.index('by_org_status', ['organizationId', 'status']),
	developerCredentials: defineTable({
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		keyId: v.string(),
		algorithm: v.literal('ES256'),
		publicJwk: v.string(),
		status: v.union(v.literal('active'), v.literal('revoked')),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()),
		revokedAt: v.optional(v.number()),
		lastUsedAt: v.optional(v.number())
	})
		.index('by_key_id', ['keyId'])
		.index('by_account', ['serviceAccountId'])
		.index('by_org_status', ['organizationId', 'status']),
	developerApiNonces: defineTable({
		organizationId: v.id('organizations'),
		credentialId: v.id('developerCredentials'),
		nonceHash: v.string(),
		expiresAt: v.number(),
		createdAt: v.number()
	})
		.index('by_credential_nonce', ['credentialId', 'nonceHash'])
		.index('by_expiry', ['expiresAt']),
	developerApiIdempotency: defineTable({
		organizationId: v.id('organizations'),
		serviceAccountId: v.id('developerServiceAccounts'),
		method: v.string(),
		route: v.string(),
		key: v.string(),
		requestFingerprint: v.string(),
		status: v.union(
			v.literal('in_progress'),
			v.literal('completed'),
			v.literal('failed'),
			v.literal('ambiguous')
		),
		requestId: v.string(),
		responseStatus: v.optional(v.number()),
		responseBody: v.optional(v.any()),
		resourceId: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		expiresAt: v.number()
	})
		.index('by_request', ['organizationId', 'serviceAccountId', 'method', 'route', 'key'])
		.index('by_expiry', ['expiresAt']),
	developerApiRateLimits: defineTable({
		organizationId: v.id('organizations'),
		credentialId: v.id('developerCredentials'),
		bucket: v.string(),
		windowStartedAt: v.number(),
		count: v.number(),
		updatedAt: v.number()
	}).index('by_credential_bucket_window', ['credentialId', 'bucket', 'windowStartedAt']),
	developerApiRequests: defineTable({
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
		correlationId: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_org_time', ['organizationId', 'createdAt'])
		.index('by_account_time', ['serviceAccountId', 'createdAt']),
	developerWebhookEndpoints: defineTable({
		organizationId: v.id('organizations'),
		url: v.string(),
		eventTypes: v.array(v.string()),
		schemaVersion: v.literal(1),
		status: v.union(v.literal('active'), v.literal('paused'), v.literal('revoked')),
		createdBy: v.optional(v.id('users')),
		createdByServiceAccount: v.optional(v.id('developerServiceAccounts')),
		createdAt: v.number(),
		updatedAt: v.number(),
		lastSuccessAt: v.optional(v.number()),
		lastFailureAt: v.optional(v.number())
	})
		.index('by_org', ['organizationId'])
		.index('by_org_status', ['organizationId', 'status']),
	developerEvents: defineTable({
		organizationId: v.id('organizations'),
		eventType: v.string(),
		aggregateType: v.string(),
		aggregateId: v.string(),
		aggregateSequence: v.number(),
		schemaVersion: v.literal(1),
		data: v.any(),
		occurredAt: v.number()
	})
		.index('by_org_time', ['organizationId', 'occurredAt'])
		.index('by_aggregate_sequence', [
			'organizationId',
			'aggregateType',
			'aggregateId',
			'aggregateSequence'
		]),
	developerWebhookDeliveries: defineTable({
		organizationId: v.id('organizations'),
		endpointId: v.id('developerWebhookEndpoints'),
		eventId: v.id('developerEvents'),
		attempt: v.number(),
		status: v.union(
			v.literal('pending'),
			v.literal('claimed'),
			v.literal('retrying'),
			v.literal('succeeded'),
			v.literal('failed')
		),
		deliveryKey: v.string(),
		responseStatus: v.optional(v.number()),
		errorCode: v.optional(v.string()),
		nextAttemptAt: v.optional(v.number()),
		claimedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_delivery_key', ['deliveryKey'])
		.index('by_endpoint_time', ['endpointId', 'createdAt'])
		.index('by_status_next', ['status', 'nextAttemptAt']),
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
		status: v.union(v.literal('pendingApproval'), v.literal('approved'), v.literal('revoked')),
		createdBy: v.id('users'),
		approvedBy: v.optional(v.id('users')),
		approvedAt: v.optional(v.number())
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
		requestFingerprint: v.optional(v.string()),
		createdBy: v.optional(v.id('users')),
		sourceWalletId: v.optional(v.id('wallets')),
		automationRunId: v.optional(v.id('automationRuns')),
		sourcePayableId: v.optional(v.id('payables')),
		sourceBatchItemId: v.optional(v.id('paymentBatchItems')),
		correlationId: v.string(),
		errorCode: v.optional(v.string()),
		supersedesOperationId: v.optional(v.id('operations')),
		providerAttemptId: v.optional(v.id('providerAttempts')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_org_status', ['organizationId', 'status'])
		.index('by_status', ['status', 'updatedAt'])
		.index('by_org_request', ['organizationId', 'requestKey'])
		.index('by_payable', ['sourcePayableId', 'createdAt'])
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
			v.literal('pendingApproval'),
			v.literal('approved'),
			v.literal('paymentQueued'),
			v.literal('paid'),
			v.literal('failed'),
			v.literal('void')
		),
		operationId: v.optional(v.id('operations')),
		sourceWalletId: v.optional(v.id('wallets')),
		approvedBy: v.optional(v.id('users')),
		approvedAt: v.optional(v.number()),
		submittedAt: v.optional(v.number()),
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
			v.literal('draft'),
			v.literal('ready'),
			v.literal('pendingApproval'),
			v.literal('approved'),
			v.literal('scheduled'),
			v.literal('dispatching'),
			v.literal('queued'),
			v.literal('processing'),
			v.literal('completed'),
			v.literal('partiallyCompleted'),
			v.literal('needsAttention'),
			v.literal('failed'),
			v.literal('cancelled')
		),
		requestKey: v.optional(v.string()),
		revision: v.optional(v.number()),
		scheduledFor: v.optional(v.number()),
		payPeriodStart: v.optional(v.string()),
		payPeriodEnd: v.optional(v.string()),
		payDate: v.optional(v.string()),
		payrollKind: v.optional(v.union(v.literal('regular'), v.literal('offCycle'))),
		denominationCurrency: v.optional(v.string()),
		finalizedAt: v.optional(v.number()),
		approvedAt: v.optional(v.number()),
		approvedBy: v.optional(v.id('users')),
		dispatchedAt: v.optional(v.number()),
		submittedAt: v.optional(v.number()),
		failureCode: v.optional(v.string()),
		sourceWalletId: v.id('wallets'),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_org_request', ['organizationId', 'requestKey'])
		.index('by_status_schedule', ['status', 'scheduledFor']),
	paymentBatchItems: defineTable({
		organizationId: v.id('organizations'),
		batchId: v.id('paymentBatches'),
		label: v.string(),
		recipientId: v.optional(v.id('recipients')),
		destination: v.string(),
		amount: v.string(),
		memo: v.optional(v.string()),
		status: v.union(
			v.literal('ready'),
			v.literal('queued'),
			v.literal('pendingApproval'),
			v.literal('processing'),
			v.literal('succeeded'),
			v.literal('failed'),
			v.literal('ambiguous'),
			v.literal('cancelled')
		),
		userId: v.optional(v.id('users')),
		payrollProfileId: v.optional(v.id('payrollProfiles')),
		compensationProfileId: v.optional(v.id('compensationProfiles')),
		destinationKind: v.optional(
			v.union(v.literal('personal'), v.literal('external'), v.literal('recipient'))
		),
		destinationVerifiedAt: v.optional(v.number()),
		destinationVersion: v.optional(v.number()),
		sourceRow: v.optional(v.number()),
		payslipSnapshot: v.optional(
			v.object({
				employeeCode: v.optional(v.string()),
				department: v.optional(v.string()),
				denominationCurrency: v.string(),
				earnings: v.array(v.object({ label: v.string(), amount: v.string() })),
				deductions: v.array(v.object({ label: v.string(), amount: v.string() })),
				grossAmount: v.string(),
				deductionAmount: v.string(),
				netAmount: v.string(),
				compensationProfileVersion: v.optional(v.number())
			})
		),
		routeReason: v.optional(v.string()),
		failureCode: v.optional(v.string()),
		operationId: v.optional(v.id('operations')),
		requestKey: v.string()
	})
		.index('by_batch', ['batchId'])
		.index('by_operation', ['operationId'])
		.index('by_org_user', ['organizationId', 'userId']),
	providerAttempts: defineTable({
		organizationId: v.id('organizations'),
		operationId: v.id('operations'),
		attemptKey: v.string(),
		providerKind: v.union(v.literal('privyAction'), v.literal('privyIntent')),
		status: v.union(
			v.literal('pending'),
			v.literal('claimed'),
			v.literal('submitted'),
			v.literal('ambiguous'),
			v.literal('confirmed'),
			v.literal('failed')
		),
		providerReferenceId: v.optional(v.string()),
		claimedAt: v.optional(v.number()),
		providerStartedAt: v.optional(v.number()),
		submittedAt: v.optional(v.number()),
		errorCode: v.optional(v.string()),
		updatedAt: v.number()
	})
		.index('by_operation', ['operationId'])
		.index('by_attempt_key', ['attemptKey'])
		.index('by_status', ['status', 'updatedAt']),
	erpConnections: defineTable({
		organizationId: v.id('organizations'),
		provider: v.literal('erpnext'),
		label: v.string(),
		baseUrl: v.string(),
		credentialMode: v.union(v.literal('saved'), v.literal('transient')),
		encryptedCredentials: v.optional(
			v.object({
				version: v.literal(1),
				iv: v.string(),
				ciphertext: v.string(),
				authTag: v.string()
			})
		),
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
	})
		.index('by_org', ['organizationId'])
		.index('by_org_provider', ['organizationId', 'provider'])
		.index('by_auto_due', ['autoSyncEnabled', 'nextSyncAt']),
	erpExternalAccounts: defineTable({
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
	})
		.index('by_connection', ['connectionId'])
		.index('by_connection_provider_id', ['connectionId', 'providerAccountId']),
	erpReferenceData: defineTable({
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
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
		providerModifiedAt: v.optional(v.string()),
		syncedAt: v.number()
	})
		.index('by_connection', ['connectionId'])
		.index('by_connection_type', ['connectionId', 'referenceType'])
		.index('by_connection_type_provider_id', [
			'connectionId',
			'referenceType',
			'providerReferenceId'
		]),
	erpSyncRuns: defineTable({
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
	})
		.index('by_run_key', ['runKey'])
		.index('by_org', ['organizationId', 'createdAt'])
		.index('by_connection', ['connectionId', 'createdAt']),
	erpAccountMappings: defineTable({
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		externalAccountId: v.id('erpExternalAccounts'),
		chartAccountId: v.id('chartAccounts'),
		status: v.union(v.literal('active'), v.literal('disabled')),
		createdBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_connection', ['connectionId'])
		.index('by_connection_external', ['connectionId', 'externalAccountId'])
		.index('by_org_chart', ['organizationId', 'chartAccountId']),
	erpExternalDocuments: defineTable({
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
	})
		.index('by_connection_type', ['connectionId', 'documentType'])
		.index('by_connection_type_provider_id', [
			'connectionId',
			'documentType',
			'providerDocumentId'
		]),
	erpSettlementRuns: defineTable({
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
		.index('by_run_key', ['runKey'])
		.index('by_connection', ['connectionId', 'createdAt'])
		.index('by_source', ['organizationId', 'sourceType', 'sourceId']),
	erpDocumentPushRuns: defineTable({
		organizationId: v.id('organizations'),
		connectionId: v.id('erpConnections'),
		sourceType: v.union(v.literal('payable'), v.literal('invoice')),
		sourceId: v.string(),
		documentType: v.union(v.literal('purchaseInvoice'), v.literal('salesInvoice')),
		runKey: v.string(),
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
		requestedBy: v.id('users'),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_run_key', ['runKey'])
		.index('by_connection', ['connectionId', 'createdAt'])
		.index('by_source', ['organizationId', 'sourceType', 'sourceId']),
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
		.index('by_source_account', ['sourceKey', 'account'])
		.index('by_source_account_direction', ['sourceKey', 'account', 'direction']),
	accountingBooks: defineTable({
		organizationId: v.id('organizations'),
		name: v.string(),
		functionalCurrency: v.string(),
		timezone: v.string(),
		fiscalYearStartMonth: v.number(),
		status: v.union(v.literal('active'), v.literal('archived')),
		createdAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_org_status', ['organizationId', 'status']),
	chartAccounts: defineTable({
		organizationId: v.id('organizations'),
		bookId: v.id('accountingBooks'),
		code: v.string(),
		name: v.string(),
		type: v.union(
			v.literal('asset'),
			v.literal('liability'),
			v.literal('equity'),
			v.literal('revenue'),
			v.literal('expense')
		),
		normalBalance: v.union(v.literal('debit'), v.literal('credit')),
		parentId: v.optional(v.id('chartAccounts')),
		isPosting: v.boolean(),
		active: v.boolean(),
		createdAt: v.number()
	})
		.index('by_book', ['bookId', 'code'])
		.index('by_org_code', ['organizationId', 'code']),
	accountingPeriods: defineTable({
		organizationId: v.id('organizations'),
		bookId: v.id('accountingBooks'),
		label: v.string(),
		startsAt: v.number(),
		endsAt: v.number(),
		status: v.union(v.literal('open'), v.literal('softClosed'), v.literal('locked')),
		closedBy: v.optional(v.id('users')),
		closedAt: v.optional(v.number()),
		reopenedBy: v.optional(v.id('users')),
		reopenReason: v.optional(v.string())
	})
		.index('by_book_start', ['bookId', 'startsAt'])
		.index('by_org_status', ['organizationId', 'status']),
	closeChecklistItems: defineTable({
		organizationId: v.id('organizations'),
		periodId: v.id('accountingPeriods'),
		key: v.string(),
		label: v.string(),
		status: v.union(v.literal('open'), v.literal('completed'), v.literal('waived')),
		completedBy: v.optional(v.id('users')),
		completedAt: v.optional(v.number()),
		note: v.optional(v.string())
	})
		.index('by_period', ['periodId', 'key'])
		.index('by_org_status', ['organizationId', 'status']),
	postingRules: defineTable({
		organizationId: v.id('organizations'),
		bookId: v.id('accountingBooks'),
		key: v.string(),
		version: v.number(),
		debitAccountCode: v.string(),
		creditAccountCode: v.string(),
		status: v.union(v.literal('active'), v.literal('superseded')),
		createdAt: v.number()
	})
		.index('by_book_key', ['bookId', 'key'])
		.index('by_org', ['organizationId']),
	journals: defineTable({
		organizationId: v.id('organizations'),
		bookId: v.id('accountingBooks'),
		sourceKey: v.string(),
		sourceType: v.union(
			v.literal('operation'),
			v.literal('invoicePayment'),
			v.literal('invoice'),
			v.literal('payable'),
			v.literal('payroll'),
			v.literal('manual'),
			v.literal('migration')
		),
		version: v.number(),
		status: v.union(v.literal('draft'), v.literal('posted'), v.literal('reversed')),
		postingDate: v.number(),
		description: v.string(),
		contentHash: v.string(),
		postingRuleId: v.optional(v.id('postingRules')),
		preparedBy: v.optional(v.id('users')),
		reviewedBy: v.optional(v.id('users')),
		reversalOf: v.optional(v.id('journals')),
		createdAt: v.number(),
		postedAt: v.optional(v.number())
	})
		.index('by_org_date', ['organizationId', 'postingDate'])
		.index('by_source', ['organizationId', 'sourceKey', 'version'])
		.index('by_book_status', ['bookId', 'status']),
	journalLines: defineTable({
		organizationId: v.id('organizations'),
		journalId: v.id('journals'),
		lineNumber: v.number(),
		accountId: v.id('chartAccounts'),
		debit: v.string(),
		credit: v.string(),
		functionalCurrency: v.string(),
		asset: v.optional(v.union(v.literal('ETH'), v.literal('USDC'))),
		assetQuantity: v.optional(v.string()),
		walletId: v.optional(v.id('wallets')),
		counterparty: v.optional(v.string()),
		department: v.optional(v.string()),
		memo: v.optional(v.string())
	})
		.index('by_journal', ['journalId', 'lineNumber'])
		.index('by_org_account', ['organizationId', 'accountId']),
	balanceSnapshots: defineTable({
		organizationId: v.id('organizations'),
		bookId: v.id('accountingBooks'),
		walletId: v.id('wallets'),
		asset: v.union(v.literal('ETH'), v.literal('USDC')),
		rawValue: v.string(),
		displayValue: v.string(),
		blockNumber: v.optional(v.number()),
		observedAt: v.number()
	})
		.index('by_wallet_asset', ['walletId', 'asset', 'observedAt'])
		.index('by_org_time', ['organizationId', 'observedAt']),
	reconciliationRuns: defineTable({
		organizationId: v.id('organizations'),
		bookId: v.id('accountingBooks'),
		runKey: v.string(),
		status: v.union(
			v.literal('pending'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('failed')
		),
		startedBy: v.id('users'),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		exceptionCount: v.optional(v.number())
	})
		.index('by_run_key', ['runKey'])
		.index('by_org_time', ['organizationId', 'startedAt']),
	reconciliationCases: defineTable({
		organizationId: v.id('organizations'),
		runId: v.optional(v.id('reconciliationRuns')),
		kind: v.union(
			v.literal('missingJournal'),
			v.literal('missingMapping'),
			v.literal('missingValuation'),
			v.literal('balanceVariance'),
			v.literal('overpayment'),
			v.literal('latePayment'),
			v.literal('latePosting'),
			v.literal('syncFailure')
		),
		sourceType: v.string(),
		sourceId: v.string(),
		status: v.union(v.literal('open'), v.literal('resolved'), v.literal('waived')),
		severity: v.union(v.literal('info'), v.literal('warning'), v.literal('blocking')),
		title: v.string(),
		details: v.string(),
		assignedTo: v.optional(v.id('users')),
		resolution: v.optional(v.string()),
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
		resolvedBy: v.optional(v.id('users'))
	})
		.index('by_org_status', ['organizationId', 'status'])
		.index('by_run', ['runId']),
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
