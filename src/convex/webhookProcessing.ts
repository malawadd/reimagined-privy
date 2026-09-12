import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { BASE_SEPOLIA, deterministicRunKey, normalizeDecimal } from '../lib/domain';

function asString(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return undefined;
}

function nestedString(value: unknown, keys: string[]): string | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const record = value as Record<string, unknown>;
	for (const key of keys) {
		const found = asString(record[key]);
		if (found) return found;
	}
	return undefined;
}

export const insertReceipt = internalMutation({
	args: {
		svixMessageId: v.string(),
		payloadIdempotencyKey: v.optional(v.string()),
		eventType: v.string(),
		payload: v.any()
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('webhookReceipts')
			.withIndex('by_svix_id', (q) => q.eq('svixMessageId', args.svixMessageId))
			.unique();
		if (existing) return { duplicate: true, receiptId: existing._id };
		if (args.payloadIdempotencyKey) {
			const samePayload = await ctx.db
				.query('webhookReceipts')
				.withIndex('by_payload_key', (q) =>
					q.eq('payloadIdempotencyKey', args.payloadIdempotencyKey)
				)
				.first();
			if (samePayload) return { duplicate: true, receiptId: samePayload._id };
		}
		const receiptId = await ctx.db.insert('webhookReceipts', { ...args, receivedAt: Date.now() });
		await ctx.scheduler.runAfter(0, internal.webhookProcessing.processReceipt, { receiptId });
		return { duplicate: false, receiptId };
	}
});

export const markProcessed = internalMutation({
	args: { receiptId: v.id('webhookReceipts'), error: v.optional(v.string()) },
	handler: async (ctx, args) =>
		ctx.db.patch(args.receiptId, { processedAt: Date.now(), processingError: args.error })
});

export const processReceipt = internalMutation({
	args: { receiptId: v.id('webhookReceipts') },
	handler: async (ctx, args) => {
		const receipt = await ctx.db.get(args.receiptId);
		if (!receipt || receipt.processedAt) return;
		const payload = receipt.payload as Record<string, unknown>;
		const data = (payload.data ?? payload) as Record<string, unknown>;
		const provider = { ...data, id: data.id ?? data.wallet_action_id ?? data.intent_id };
		const actionId = String(
			data.wallet_action_id ?? (receipt.eventType.includes('wallet_action') ? (data.id ?? '') : '')
		);
		const intentId = String(
			data.intent_id ?? (receipt.eventType.includes('intent') ? (data.id ?? '') : '')
		);
		let operationId: Id<'operations'> | null = null;
		if (actionId) {
			const snapshot = await ctx.db
				.query('walletActionSnapshots')
				.withIndex('by_privy_id', (q) => q.eq('privyWalletActionId', actionId))
				.first();
			operationId = snapshot?.operationId ?? null;
		}
		if (!operationId && intentId) {
			const snapshot = await ctx.db
				.query('intentSnapshots')
				.withIndex('by_privy_id', (q) => q.eq('privyIntentId', intentId))
				.first();
			operationId = snapshot?.operationId ?? null;
		}
		if (operationId)
			await ctx.scheduler.runAfter(0, internal.operationState.applyProviderState, {
				operationId,
				provider,
				source: 'webhook'
			});

		if (receipt.eventType.toLowerCase().includes('deposit')) {
			const asset = (
				asString(data.asset) ??
				asString(data.currency) ??
				nestedString(data.token, ['symbol', 'address']) ??
				nestedString(data.asset, ['symbol', 'address']) ??
				''
			).toLowerCase();
			const isUsdc = asset === 'usdc' || asset === BASE_SEPOLIA.usdc.toLowerCase();
			const rawAmount =
				asString(data.amount) ??
				asString(data.value) ??
				nestedString(data.amount, ['value', 'amount']);
			const walletId = asString(data.wallet_id) ?? nestedString(data.wallet, ['id', 'wallet_id']);
			const walletAddress = (
				asString(data.wallet_address) ??
				nestedString(data.wallet, ['address']) ??
				''
			).toLowerCase();

			let amount: string | undefined;
			try {
				amount = rawAmount ? normalizeDecimal(rawAmount, 6) : undefined;
			} catch {
				// An unrecognized amount must never become a transfer.
			}

			const sourceWallet = walletId
				? await ctx.db
						.query('wallets')
						.withIndex('by_privy_id', (q) => q.eq('privyWalletId', walletId))
						.first()
				: walletAddress
					? (await ctx.db.query('wallets').collect()).find(
							(wallet) => wallet.address.toLowerCase() === walletAddress
						)
					: null;

			if (isUsdc && amount && sourceWallet) {
				const automations = await ctx.db
					.query('automations')
					.withIndex('by_org', (q) => q.eq('organizationId', sourceWallet.organizationId))
					.collect();
				for (const automation of automations) {
					if (
						automation.type !== 'depositSweep' ||
						automation.status !== 'active' ||
						automation.sourceWalletId !== sourceWallet._id
					)
						continue;
					const runKey = deterministicRunKey(automation._id, receipt.svixMessageId);
					const existing = await ctx.db
						.query('automationRuns')
						.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
						.unique();
					if (existing) continue;
					const runId = await ctx.db.insert('automationRuns', {
						organizationId: automation.organizationId,
						automationId: automation._id,
						runKey,
						amount,
						sourceEventId: receipt.svixMessageId,
						status: 'pending',
						providerReferenceId: runKey,
						updatedAt: Date.now()
					});
					await ctx.scheduler.runAfter(0, internal.automationExecution.claimAndExecute, {
						runId
					});
					await ctx.db.insert('auditEvents', {
						organizationId: automation.organizationId,
						actorType: 'privy',
						actorId: 'privy-webhook',
						action: 'automation.deposit_sweep_queued',
						resourceType: 'automationRun',
						resourceId: String(runId),
						correlationId: runKey,
						privyIds: [sourceWallet.privyWalletId],
						metadata: { amount, asset: 'USDC', sourceEventId: receipt.svixMessageId },
						occurredAt: Date.now()
					});
				}
			}
		}
		await ctx.db.patch(args.receiptId, { processedAt: Date.now() });
	}
});
