import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { postBalancedEntry } from './lib/ledger';
import {
	BASE_SEPOLIA,
	decimalToUnits,
	deterministicRunKey,
	normalizeDecimal,
	normalizeEvmAddress,
	unitsToDecimal
} from '../lib/domain';

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
	returns: v.object({ duplicate: v.boolean(), receiptId: v.id('webhookReceipts') }),
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
		await ctx.scheduler.runAfter(0, internal.webhooks.processSafely, { receiptId });
		return { duplicate: false, receiptId };
	}
});

export const markProcessed = internalMutation({
	args: { receiptId: v.id('webhookReceipts'), error: v.optional(v.string()) },
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.receiptId, { processedAt: Date.now(), processingError: args.error });
		return null;
	}
});

export const processReceipt = internalMutation({
	args: { receiptId: v.id('webhookReceipts') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const receipt = await ctx.db.get(args.receiptId);
		if (!receipt || receipt.processedAt) return null;
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
			const officialFundsDeposit = receipt.eventType === 'wallet.funds_deposited';
			const asset = (
				asString(data.asset) ??
				asString(data.currency) ??
				nestedString(data.token, ['symbol', 'address']) ??
				nestedString(data.asset, ['symbol', 'address']) ??
				''
			).toLowerCase();
			const isUsdc = asset === 'usdc' || asset === BASE_SEPOLIA.usdc.toLowerCase();
			const supportedChain = officialFundsDeposit
				? asString(data.caip2) === BASE_SEPOLIA.caip2
				: true;
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
			let indexedWalletAddress: string | undefined;
			try {
				indexedWalletAddress = walletAddress ? normalizeEvmAddress(walletAddress) : undefined;
			} catch {
				indexedWalletAddress = undefined;
			}

			let amount: string | undefined;
			try {
				amount = rawAmount
					? officialFundsDeposit
						? unitsToDecimal(rawAmount, 6)
						: normalizeDecimal(rawAmount, 6)
					: undefined;
			} catch {
				// An unrecognized amount must never become a transfer.
			}

			const sourceWallet = walletId
				? await ctx.db
						.query('wallets')
						.withIndex('by_privy_id', (q) => q.eq('privyWalletId', walletId))
						.first()
				: indexedWalletAddress
					? await ctx.db
							.query('wallets')
							.withIndex('by_address', (q) => q.eq('address', indexedWalletAddress))
							.first()
					: null;

			if (isUsdc && supportedChain && amount && sourceWallet) {
				if (sourceWallet.invoiceId && rawAmount) {
					const invoice = await ctx.db.get(sourceWallet.invoiceId);
					const existingPayment = await ctx.db
						.query('invoicePayments')
						.withIndex('by_receipt', (q) => q.eq('webhookReceiptId', receipt._id))
						.unique();
					if (invoice && !existingPayment) {
						const transactionHash =
							asString(data.transaction_hash) ?? asString(data.tx_hash) ?? 'unavailable';
						const sender = asString(data.sender) ?? 'unavailable';
						const blockValue = nestedString(data.block, ['number']);
						const blockNumber = blockValue ? Number(blockValue) : undefined;
						await ctx.db.insert('invoicePayments', {
							organizationId: invoice.organizationId,
							invoiceId: invoice._id,
							walletId: sourceWallet._id,
							webhookReceiptId: receipt._id,
							asset: 'USDC',
							amount,
							rawAmount,
							transactionHash,
							sender,
							blockNumber:
								blockNumber !== undefined && Number.isSafeInteger(blockNumber)
									? blockNumber
									: undefined,
							receivedAt: Date.now()
						});
						const paidUnits = decimalToUnits(invoice.paidAmount, 6) + decimalToUnits(amount, 6);
						const invoiceUnits = decimalToUnits(invoice.amount, 6);
						const incomingUnits = decimalToUnits(amount, 6);
						const outstandingUnits =
							invoiceUnits > decimalToUnits(invoice.paidAmount, 6)
								? invoiceUnits - decimalToUnits(invoice.paidAmount, 6)
								: 0n;
						const receivableUnits =
							incomingUnits < outstandingUnits ? incomingUnits : outstandingUnits;
						const depositUnits = incomingUnits - receivableUnits;
						const nextStatus =
							invoice.status === 'void'
								? 'void'
								: paidUnits >= invoiceUnits
									? 'paid'
									: 'partiallyPaid';
						await ctx.db.patch(invoice._id, {
							paidAmount: unitsToDecimal(paidUnits.toString(), 6),
							status: nextStatus,
							updatedAt: Date.now()
						});
						const payment = await ctx.db
							.query('invoicePayments')
							.withIndex('by_receipt', (q) => q.eq('webhookReceiptId', receipt._id))
							.unique();
						if (payment)
							await postBalancedEntry(ctx, {
								organizationId: invoice.organizationId,
								sourceKey: `invoicePayment:${payment._id}`,
								sourceType: 'invoicePayment',
								sourceId: payment._id,
								debitAccount: `Wallet:collection:${sourceWallet._id}`,
								creditAccount: 'Accounts receivable',
								asset: 'USDC',
								amount,
								receivableAmount: unitsToDecimal(receivableUnits.toString(), 6),
								customerDepositAmount: unitsToDecimal(depositUnits.toString(), 6),
								transactionHash,
								occurredAt: Date.now()
							});
						await ctx.db.insert('auditEvents', {
							organizationId: invoice.organizationId,
							actorType: 'privy',
							actorId: 'privy-webhook',
							action: 'invoice.payment_received',
							resourceType: 'invoice',
							resourceId: invoice._id,
							correlationId: `invoice:${invoice._id}`,
							privyIds: [sourceWallet.privyWalletId],
							transactionHash,
							metadata: { amount, asset: 'USDC', sourceEventId: receipt.svixMessageId },
							occurredAt: Date.now()
						});
					}
				}
				const automations = await ctx.db
					.query('automations')
					.withIndex('by_org', (q) => q.eq('organizationId', sourceWallet.organizationId))
					.take(100);
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
		return null;
	}
});
