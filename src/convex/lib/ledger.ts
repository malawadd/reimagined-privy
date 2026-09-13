import type { GenericMutationCtx } from 'convex/server';
import type { DataModel, Doc } from '../_generated/dataModel';
import { postSourceJournal } from './accounting';

export async function postBalancedEntry(
	ctx: GenericMutationCtx<DataModel>,
	input: {
		organizationId: DataModel['organizations']['document']['_id'];
		sourceKey: string;
		sourceType: 'operation' | 'invoicePayment';
		sourceId: string;
		debitAccount: string;
		creditAccount: string;
		asset: 'ETH' | 'USDC';
		amount: string;
		transactionHash?: string;
		occurredAt: number;
		receivableAmount?: string;
		customerDepositAmount?: string;
	}
) {
	for (const [account, direction] of [
		[input.debitAccount, 'debit'],
		[input.creditAccount, 'credit']
	] as const) {
		const existing = await ctx.db
			.query('ledgerEntries')
			.withIndex('by_source_account_direction', (q) =>
				q.eq('sourceKey', input.sourceKey).eq('account', account).eq('direction', direction)
			)
			.unique();
		if (!existing)
			await ctx.db.insert('ledgerEntries', {
				organizationId: input.organizationId,
				sourceKey: input.sourceKey,
				sourceType: input.sourceType,
				sourceId: input.sourceId,
				account,
				direction,
				asset: input.asset,
				amount: input.amount,
				transactionHash: input.transactionHash,
				occurredAt: input.occurredAt,
				createdAt: Date.now()
			});
	}
	if (input.sourceType === 'invoicePayment')
		await postSourceJournal(ctx, {
			organizationId: input.organizationId,
			sourceKey: input.sourceKey,
			sourceType: 'invoicePayment',
			amount: input.amount,
			asset: input.asset,
			postingDate: input.occurredAt,
			description: 'Invoice collection received',
			receivableAmount: input.receivableAmount,
			customerDepositAmount: input.customerDepositAmount
		});
}

export async function postOperationEntry(
	ctx: GenericMutationCtx<DataModel>,
	operation: Doc<'operations'>,
	transactionHash?: string
) {
	if (!operation.asset || !operation.amount) return;
	let debitAccount = 'Treasury disbursement';
	if (operation.sourcePayableId) debitAccount = 'Payables and expenses';
	if (operation.sourceBatchItemId) {
		const item = await ctx.db.get(operation.sourceBatchItemId);
		const batch = item ? await ctx.db.get(item.batchId) : null;
		debitAccount = batch?.type === 'payroll' ? 'Payroll clearing' : 'Batch disbursement';
	}
	await postBalancedEntry(ctx, {
		organizationId: operation.organizationId,
		sourceKey: `operation:${operation._id}`,
		sourceType: 'operation',
		sourceId: operation._id,
		debitAccount,
		creditAccount: `Wallet:treasury:${operation.sourceWalletId ?? 'unknown'}`,
		asset: operation.asset,
		amount: operation.amount,
		transactionHash,
		occurredAt: operation.updatedAt
	});
	await postSourceJournal(ctx, {
		organizationId: operation.organizationId,
		sourceKey: `operation:${operation._id}`,
		sourceType:
			operation.sourceBatchItemId && debitAccount === 'Payroll clearing' ? 'payroll' : 'operation',
		amount: operation.amount,
		asset: operation.asset,
		postingDate: operation.updatedAt,
		description: operation.reference,
		walletId: operation.sourceWalletId,
		isPayroll: debitAccount === 'Payroll clearing',
		isPayableSettlement: Boolean(operation.sourcePayableId),
		isCollectionSweep:
			operation.kind === 'automationRun' && operation.memo?.toLowerCase().includes('sweep')
	});
}
