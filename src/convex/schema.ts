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
		active: v.boolean()
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
		role,
		invitedBy: v.id('users'),
		status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('revoked')),
		expiresAt: v.number()
	}).index('by_org_email', ['organizationId', 'email']),
	servicePrincipals: defineTable({
		organizationId: v.id('organizations'),
		name: v.string(),
		purpose: v.string(),
		privyAuthorizationKeyId: v.string(),
		status: v.union(v.literal('active'), v.literal('revoked'))
	}).index('by_org', ['organizationId']),
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
		syncVersion: v.number(),
		syncedAt: v.number()
	})
		.index('by_org', ['organizationId'])
		.index('by_privy_id', ['privyWalletId']),
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
		createdBy: v.optional(v.id('users')),
		automationRunId: v.optional(v.id('automationRuns')),
		correlationId: v.string(),
		errorCode: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_org', ['organizationId'])
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
		.index('by_due', ['status', 'nextRunAt']),
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
