import type { GenericMutationCtx } from 'convex/server';
import type { DataModel, Id } from '../_generated/dataModel';
import {
	DEFAULT_ACCOUNTS,
	DEFAULT_POSTING_RULES,
	postingRuleFor,
	validateJournalLines
} from '../../lib/accounting';

type MutationCtx = GenericMutationCtx<DataModel>;

export async function ensureAccountingBook(ctx: MutationCtx, organizationId: Id<'organizations'>) {
	let book = await ctx.db
		.query('accountingBooks')
		.withIndex('by_org_status', (q) =>
			q.eq('organizationId', organizationId).eq('status', 'active')
		)
		.unique();
	if (!book) {
		const bookId = await ctx.db.insert('accountingBooks', {
			organizationId,
			name: 'Primary book',
			functionalCurrency: 'USD',
			timezone: 'Asia/Riyadh',
			fiscalYearStartMonth: 1,
			status: 'active',
			createdAt: Date.now()
		});
		book = await ctx.db.get(bookId);
	}
	if (!book) throw new Error('Accounting book could not be initialized.');
	for (const account of DEFAULT_ACCOUNTS) {
		const existing = await ctx.db
			.query('chartAccounts')
			.withIndex('by_org_code', (q) =>
				q.eq('organizationId', organizationId).eq('code', account.code)
			)
			.unique();
		if (!existing)
			await ctx.db.insert('chartAccounts', {
				organizationId,
				bookId: book._id,
				...account,
				isPosting: true,
				active: true,
				createdAt: Date.now()
			});
	}
	for (const rule of DEFAULT_POSTING_RULES) {
		const existing = await ctx.db
			.query('postingRules')
			.withIndex('by_book_key', (q) => q.eq('bookId', book._id).eq('key', rule.key))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.unique();
		if (!existing)
			await ctx.db.insert('postingRules', {
				organizationId,
				bookId: book._id,
				...rule,
				version: 1,
				status: 'active',
				createdAt: Date.now()
			});
	}
	return book;
}

export async function postSourceJournal(
	ctx: MutationCtx,
	input: {
		organizationId: Id<'organizations'>;
		sourceKey: string;
		sourceType: 'operation' | 'invoicePayment' | 'invoice' | 'payable' | 'payroll';
		amount: string;
		asset: 'ETH' | 'USDC';
		postingDate: number;
		description: string;
		walletId?: Id<'wallets'>;
		isCollectionSweep?: boolean;
		isPayroll?: boolean;
		isPayrollAccrual?: boolean;
		isPayableSettlement?: boolean;
		receivableAmount?: string;
		customerDepositAmount?: string;
	}
) {
	const book = await ensureAccountingBook(ctx, input.organizationId);
	if (input.asset !== 'USDC') {
		const existingCase = await ctx.db
			.query('reconciliationCases')
			.withIndex('by_org_status', (q) =>
				q.eq('organizationId', input.organizationId).eq('status', 'open')
			)
			.take(100);
		if (
			!existingCase.some(
				(item) => item.sourceType === input.sourceType && item.sourceId === input.sourceKey
			)
		)
			await ctx.db.insert('reconciliationCases', {
				organizationId: input.organizationId,
				kind: 'missingValuation',
				sourceType: input.sourceType,
				sourceId: input.sourceKey,
				status: 'open',
				severity: 'blocking',
				title: 'Functional-currency valuation required',
				details: `${input.asset} source ${input.sourceKey} was preserved but not posted as USD.`,
				createdAt: Date.now()
			});
		return null;
	}
	const existing = await ctx.db
		.query('journals')
		.withIndex('by_source', (q) =>
			q.eq('organizationId', input.organizationId).eq('sourceKey', input.sourceKey).eq('version', 1)
		)
		.unique();
	if (existing) return existing._id;
	const lockedPeriods = await ctx.db
		.query('accountingPeriods')
		.withIndex('by_book_start', (q) => q.eq('bookId', book._id))
		.take(120);
	if (
		lockedPeriods.some(
			(period) =>
				period.status === 'locked' &&
				input.postingDate >= period.startsAt &&
				input.postingDate <= period.endsAt
		)
	) {
		const openCases = await ctx.db
			.query('reconciliationCases')
			.withIndex('by_org_status', (q) =>
				q.eq('organizationId', input.organizationId).eq('status', 'open')
			)
			.take(500);
		if (!openCases.some((item) => item.kind === 'latePosting' && item.sourceId === input.sourceKey))
			await ctx.db.insert('reconciliationCases', {
				organizationId: input.organizationId,
				kind: 'latePosting',
				sourceType: input.sourceType,
				sourceId: input.sourceKey,
				status: 'open',
				severity: 'blocking',
				title: 'Source event falls in a locked period',
				details: `${input.sourceKey} was preserved but not posted because its accounting period is locked.`,
				createdAt: Date.now()
			});
		return null;
	}
	const rule = postingRuleFor(input);
	const postingRule = await ctx.db
		.query('postingRules')
		.withIndex('by_book_key', (q) => q.eq('bookId', book._id).eq('key', rule.key))
		.filter((q) => q.eq(q.field('status'), 'active'))
		.unique();
	if (!postingRule) throw new Error(`Posting rule ${rule.key} is unavailable.`);
	const accounts = new Map<string, Id<'chartAccounts'>>();
	const accountCodes = [postingRule.debitAccountCode, postingRule.creditAccountCode];
	if (input.customerDepositAmount && input.customerDepositAmount !== '0') accountCodes.push('2050');
	for (const code of [...new Set(accountCodes)]) {
		const account = await ctx.db
			.query('chartAccounts')
			.withIndex('by_org_code', (q) =>
				q.eq('organizationId', input.organizationId).eq('code', code)
			)
			.unique();
		if (!account) throw new Error(`Accounting account ${code} is unavailable.`);
		accounts.set(code, account._id);
	}
	const lines =
		input.sourceType === 'invoicePayment' && input.receivableAmount
			? [
					{ accountCode: postingRule.debitAccountCode, debit: input.amount, credit: '0' },
					...(input.receivableAmount !== '0'
						? [
								{
									accountCode: postingRule.creditAccountCode,
									debit: '0',
									credit: input.receivableAmount
								}
							]
						: []),
					...(input.customerDepositAmount && input.customerDepositAmount !== '0'
						? [{ accountCode: '2050', debit: '0', credit: input.customerDepositAmount }]
						: [])
				]
			: [
					{ accountCode: postingRule.debitAccountCode, debit: input.amount, credit: '0' },
					{ accountCode: postingRule.creditAccountCode, debit: '0', credit: input.amount }
				];
	validateJournalLines(lines, input.asset === 'USDC' ? 6 : 18);
	const contentHash = await sha256(JSON.stringify({ sourceKey: input.sourceKey, lines }));
	const journalId = await ctx.db.insert('journals', {
		organizationId: input.organizationId,
		bookId: book._id,
		sourceKey: input.sourceKey,
		sourceType: input.sourceType,
		version: 1,
		status: 'posted',
		postingDate: input.postingDate,
		description: input.description,
		contentHash,
		postingRuleId: postingRule._id,
		createdAt: Date.now(),
		postedAt: Date.now()
	});
	for (const [index, line] of lines.entries())
		await ctx.db.insert('journalLines', {
			organizationId: input.organizationId,
			journalId,
			lineNumber: index + 1,
			accountId: accounts.get(line.accountCode)!,
			debit: line.debit,
			credit: line.credit,
			functionalCurrency: book.functionalCurrency,
			asset: input.asset,
			assetQuantity: input.amount,
			walletId: ['1000', '1010'].includes(line.accountCode) ? input.walletId : undefined,
			memo: rule.key
		});
	return journalId;
}

export async function prepareSourceJournalReversal(
	ctx: MutationCtx,
	input: {
		organizationId: Id<'organizations'>;
		sourceKey: string;
		reason: string;
		preparedBy: Id<'users'>;
	}
) {
	const original = await ctx.db
		.query('journals')
		.withIndex('by_source', (q) =>
			q.eq('organizationId', input.organizationId).eq('sourceKey', input.sourceKey).eq('version', 1)
		)
		.unique();
	if (!original) return null;
	const reversalSourceKey = `${input.sourceKey}:reversal`;
	const existing = await ctx.db
		.query('journals')
		.withIndex('by_source', (q) =>
			q
				.eq('organizationId', input.organizationId)
				.eq('sourceKey', reversalSourceKey)
				.eq('version', 1)
		)
		.unique();
	if (existing) return existing._id;
	if (original.status !== 'posted') return null;
	const originalLines = await ctx.db
		.query('journalLines')
		.withIndex('by_journal', (q) => q.eq('journalId', original._id))
		.take(100);
	if (originalLines.length < 2) throw new Error('Posted source journal is incomplete.');
	const reversalId = await ctx.db.insert('journals', {
		organizationId: input.organizationId,
		bookId: original.bookId,
		sourceKey: reversalSourceKey,
		sourceType: 'manual',
		version: 1,
		status: 'draft',
		postingDate: Date.now(),
		description: `Reversal: ${input.reason}`,
		contentHash: await sha256(
			JSON.stringify(
				originalLines.map((line) => ({
					accountId: line.accountId,
					debit: line.credit,
					credit: line.debit
				}))
			)
		),
		preparedBy: input.preparedBy,
		reversalOf: original._id,
		createdAt: Date.now()
	});
	for (const [index, line] of originalLines.entries())
		await ctx.db.insert('journalLines', {
			organizationId: input.organizationId,
			journalId: reversalId,
			lineNumber: index + 1,
			accountId: line.accountId,
			debit: line.credit,
			credit: line.debit,
			functionalCurrency: line.functionalCurrency,
			asset: line.asset,
			assetQuantity: line.assetQuantity,
			walletId: line.walletId,
			counterparty: line.counterparty,
			department: line.department,
			memo: `Reversal of ${input.sourceKey}`
		});
	return reversalId;
}

async function sha256(value: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
