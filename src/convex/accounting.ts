import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { appendAudit } from './lib/audit';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { ensureAccountingBook, postSourceJournal } from './lib/accounting';
import { postOperationEntry } from './lib/ledger';
import { assetDecimals, normalizeDecimal, decimalToUnits, unitsToDecimal } from '../lib/domain';
import { reverseJournalLines, validateJournalLines } from '../lib/accounting';

const lineInput = v.object({
	accountId: v.id('chartAccounts'),
	debit: v.string(),
	credit: v.string(),
	memo: v.optional(v.string())
});

export const initialize = mutation({
	args: { organizationId: v.id('organizations') },
	returns: v.id('accountingBooks'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:prepare');
		const book = await ensureAccountingBook(ctx, args.organizationId);
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'accounting.book_initialized',
			resourceType: 'accountingBook',
			resourceId: book._id,
			correlationId: `accounting:init:${book._id}`
		});
		return book._id;
	}
});

export const workspace = query({
	args: { organizationId: v.id('organizations') },
	returns: v.any(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		const book = await ctx.db
			.query('accountingBooks')
			.withIndex('by_org_status', (q) =>
				q.eq('organizationId', args.organizationId).eq('status', 'active')
			)
			.unique();
		if (!book) return { book: null, accounts: [], periods: [], journals: [], cases: [] };
		const [accounts, periods, journals, cases] = await Promise.all([
			ctx.db
				.query('chartAccounts')
				.withIndex('by_book', (q) => q.eq('bookId', book._id))
				.take(200),
			ctx.db
				.query('accountingPeriods')
				.withIndex('by_book_start', (q) => q.eq('bookId', book._id))
				.order('desc')
				.take(36),
			ctx.db
				.query('journals')
				.withIndex('by_org_date', (q) => q.eq('organizationId', args.organizationId))
				.order('desc')
				.take(100),
			ctx.db
				.query('reconciliationCases')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', args.organizationId).eq('status', 'open')
				)
				.take(100)
		]);
		return { book, accounts, periods, journals, cases };
	}
});

export const listJournals = query({
	args: { organizationId: v.id('organizations'), paginationOpts: paginationOptsValidator },
	returns: v.any(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		return ctx.db
			.query('journals')
			.withIndex('by_org_date', (q) => q.eq('organizationId', args.organizationId))
			.order('desc')
			.paginate(args.paginationOpts);
	}
});

export const listLines = query({
	args: { organizationId: v.id('organizations'), journalId: v.id('journals') },
	returns: v.any(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		const journal = await ctx.db.get(args.journalId);
		assertOrgScoped(journal, args.organizationId);
		return ctx.db
			.query('journalLines')
			.withIndex('by_journal', (q) => q.eq('journalId', args.journalId))
			.take(100);
	}
});

export const createManualJournal = mutation({
	args: {
		organizationId: v.id('organizations'),
		postingDate: v.number(),
		description: v.string(),
		lines: v.array(lineInput)
	},
	returns: v.id('journals'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:prepare');
		const description = args.description.trim();
		if (!description || description.length > 180)
			throw new Error('Enter a description up to 180 characters.');
		const book = await ensureAccountingBook(ctx, args.organizationId);
		const normalized = [];
		for (const line of args.lines) {
			const account = await ctx.db.get(line.accountId);
			assertOrgScoped(account, args.organizationId);
			if (account.bookId !== book._id || !account.active || !account.isPosting)
				throw new Error('Select an active posting account.');
			normalized.push({
				accountId: account._id,
				accountCode: account.code,
				debit: normalizeDecimal(line.debit || '0', 6),
				credit: normalizeDecimal(line.credit || '0', 6),
				memo: line.memo?.trim().slice(0, 180)
			});
		}
		validateJournalLines(normalized, 6);
		const contentHash = await sha256(
			JSON.stringify({ postingDate: args.postingDate, description, normalized })
		);
		const journalId = await ctx.db.insert('journals', {
			organizationId: args.organizationId,
			bookId: book._id,
			sourceKey: `manual:${crypto.randomUUID()}`,
			sourceType: 'manual',
			version: 1,
			status: 'draft',
			postingDate: args.postingDate,
			description,
			contentHash,
			preparedBy: user._id,
			createdAt: Date.now()
		});
		for (const [index, line] of normalized.entries())
			await ctx.db.insert('journalLines', {
				organizationId: args.organizationId,
				journalId,
				lineNumber: index + 1,
				accountId: line.accountId,
				debit: line.debit,
				credit: line.credit,
				functionalCurrency: book.functionalCurrency,
				memo: line.memo
			});
		return journalId;
	}
});

export const postManualJournal = mutation({
	args: { organizationId: v.id('organizations'), journalId: v.id('journals') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:review');
		const journal = await ctx.db.get(args.journalId);
		assertOrgScoped(journal, args.organizationId);
		if (journal.status !== 'draft') throw new Error('Only draft journals can be posted.');
		if (journal.preparedBy === user._id)
			throw new Error('A different reviewer must post this journal.');
		const periods = await ctx.db
			.query('accountingPeriods')
			.withIndex('by_book_start', (q) => q.eq('bookId', journal.bookId))
			.take(36);
		if (
			periods.some(
				(period) =>
					period.status === 'locked' &&
					journal.postingDate >= period.startsAt &&
					journal.postingDate <= period.endsAt
			)
		)
			throw new Error('This accounting period is locked.');
		if (journal.reversalOf) {
			const original = await ctx.db.get(journal.reversalOf);
			assertOrgScoped(original, args.organizationId);
			if (original.status !== 'posted')
				throw new Error('The original journal is no longer available for reversal.');
			await ctx.db.patch(original._id, { status: 'reversed' });
		}
		await ctx.db.patch(journal._id, {
			status: 'posted',
			reviewedBy: user._id,
			postedAt: Date.now()
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'accounting.journal_posted',
			resourceType: 'journal',
			resourceId: journal._id,
			correlationId: journal.sourceKey
		});
		return null;
	}
});

export const reverse = mutation({
	args: { organizationId: v.id('organizations'), journalId: v.id('journals'), reason: v.string() },
	returns: v.id('journals'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:review');
		const journal = await ctx.db.get(args.journalId);
		assertOrgScoped(journal, args.organizationId);
		if (journal.status !== 'posted') throw new Error('Only posted journals can be reversed.');
		const reason = args.reason.trim();
		if (!reason || reason.length > 180)
			throw new Error('Enter a reversal reason up to 180 characters.');
		const sourceKey = `${journal.sourceKey}:reversal`;
		const existing = await ctx.db
			.query('journals')
			.withIndex('by_source', (q) =>
				q.eq('organizationId', args.organizationId).eq('sourceKey', sourceKey)
			)
			.first();
		if (existing) throw new Error('A reversal already exists for this journal.');
		const original = await ctx.db
			.query('journalLines')
			.withIndex('by_journal', (q) => q.eq('journalId', journal._id))
			.take(100);
		const reversed = reverseJournalLines(
			original.map((line) => ({
				accountCode: String(line.accountId),
				debit: line.debit,
				credit: line.credit,
				memo: line.memo
			}))
		);
		const reversalId = await ctx.db.insert('journals', {
			organizationId: args.organizationId,
			bookId: journal.bookId,
			sourceKey,
			sourceType: 'manual',
			version: 1,
			status: 'draft',
			postingDate: Date.now(),
			description: `Reversal: ${reason}`,
			contentHash: await sha256(JSON.stringify(reversed)),
			preparedBy: user._id,
			reversalOf: journal._id,
			createdAt: Date.now()
		});
		for (const [index, line] of original.entries())
			await ctx.db.insert('journalLines', {
				organizationId: args.organizationId,
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
				memo: `Reversal of ${journal.sourceKey}`
			});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'accounting.reversal_prepared',
			resourceType: 'journal',
			resourceId: reversalId,
			correlationId: sourceKey,
			metadata: { reversalOf: journal._id, reason }
		});
		return reversalId;
	}
});

export const createPeriod = mutation({
	args: {
		organizationId: v.id('organizations'),
		label: v.string(),
		startsAt: v.number(),
		endsAt: v.number()
	},
	returns: v.id('accountingPeriods'),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'accounting:prepare');
		if (args.startsAt >= args.endsAt) throw new Error('Period end must follow its start.');
		const book = await ensureAccountingBook(ctx, args.organizationId);
		const existing = await ctx.db
			.query('accountingPeriods')
			.withIndex('by_book_start', (q) => q.eq('bookId', book._id).eq('startsAt', args.startsAt))
			.unique();
		if (existing) return existing._id;
		const periodId = await ctx.db.insert('accountingPeriods', {
			organizationId: args.organizationId,
			bookId: book._id,
			label: args.label.trim().slice(0, 80),
			startsAt: args.startsAt,
			endsAt: args.endsAt,
			status: 'open'
		});
		for (const [key, label] of [
			['source-completeness', 'Confirm every settlement has a posted journal'],
			['wallet-reconciliation', 'Reconcile wallet balances at a recorded observation time'],
			['exceptions', 'Resolve or explicitly waive blocking exceptions'],
			['review', 'Complete independent reviewer sign-off']
		] as const)
			await ctx.db.insert('closeChecklistItems', {
				organizationId: args.organizationId,
				periodId,
				key,
				label,
				status: 'open'
			});
		return periodId;
	}
});

export const setChecklistItem = mutation({
	args: {
		organizationId: v.id('organizations'),
		itemId: v.id('closeChecklistItems'),
		status: v.union(v.literal('completed'), v.literal('waived')),
		note: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:review');
		const item = await ctx.db.get(args.itemId);
		assertOrgScoped(item, args.organizationId);
		const note = args.note?.trim();
		if (args.status === 'waived' && !note)
			throw new Error('A waiver requires a documented reason.');
		await ctx.db.patch(item._id, {
			status: args.status,
			note: note?.slice(0, 500),
			completedBy: user._id,
			completedAt: Date.now()
		});
		return null;
	}
});

export const listChecklist = query({
	args: { organizationId: v.id('organizations'), periodId: v.id('accountingPeriods') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		const period = await ctx.db.get(args.periodId);
		assertOrgScoped(period, args.organizationId);
		return ctx.db
			.query('closeChecklistItems')
			.withIndex('by_period', (q) => q.eq('periodId', period._id))
			.take(20);
	}
});

export const setPeriodStatus = mutation({
	args: {
		organizationId: v.id('organizations'),
		periodId: v.id('accountingPeriods'),
		status: v.union(v.literal('open'), v.literal('softClosed'), v.literal('locked')),
		reason: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:close');
		const period = await ctx.db.get(args.periodId);
		assertOrgScoped(period, args.organizationId);
		const reason = args.reason?.trim();
		if (args.status === 'open' && period.status !== 'open' && !reason)
			throw new Error('Reopening a closed period requires a documented reason.');
		if (args.status === 'locked') {
			const blocking = await ctx.db
				.query('reconciliationCases')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', args.organizationId).eq('status', 'open')
				)
				.take(1);
			if (blocking.some((item) => item.severity === 'blocking'))
				throw new Error('Resolve blocking reconciliation cases before locking the period.');
			const checklist = await ctx.db
				.query('closeChecklistItems')
				.withIndex('by_period', (q) => q.eq('periodId', period._id))
				.take(20);
			if (checklist.some((item) => item.status === 'open'))
				throw new Error('Complete or waive every close checklist item before locking the period.');
		}
		await ctx.db.patch(
			period._id,
			args.status === 'open'
				? { status: 'open', reopenedBy: user._id, reopenReason: reason?.slice(0, 180) }
				: { status: args.status, closedBy: user._id, closedAt: Date.now() }
		);
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: args.status === 'open' ? 'accounting.period_reopened' : 'accounting.period_closed',
			resourceType: 'accountingPeriod',
			resourceId: period._id,
			correlationId: `accounting-period:${period._id}`,
			metadata: {
				previousStatus: period.status,
				status: args.status,
				reason: reason?.slice(0, 180)
			}
		});
		return null;
	}
});

export const resolveCase = mutation({
	args: {
		organizationId: v.id('organizations'),
		caseId: v.id('reconciliationCases'),
		resolution: v.string(),
		waive: v.boolean()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'reconciliation:manage');
		const item = await ctx.db.get(args.caseId);
		assertOrgScoped(item, args.organizationId);
		const resolution = args.resolution.trim();
		if (!resolution || resolution.length > 500)
			throw new Error('Enter a resolution up to 500 characters.');
		await ctx.db.patch(item._id, {
			status: args.waive ? 'waived' : 'resolved',
			resolution,
			resolvedAt: Date.now(),
			resolvedBy: user._id
		});
		return null;
	}
});

export const runReconciliation = mutation({
	args: { organizationId: v.id('organizations'), requestKey: v.string() },
	returns: v.object({ runId: v.id('reconciliationRuns'), exceptionCount: v.number() }),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'reconciliation:manage');
		const requestKey = args.requestKey.trim();
		if (!/^[A-Za-z0-9:_-]{12,120}$/.test(requestKey))
			throw new Error('Invalid reconciliation request key.');
		const runKey = `accounting-reconcile:${args.organizationId}:${requestKey}`;
		const existing = await ctx.db
			.query('reconciliationRuns')
			.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
			.unique();
		if (existing) return { runId: existing._id, exceptionCount: existing.exceptionCount ?? 0 };
		const book = await ensureAccountingBook(ctx, args.organizationId);
		const now = Date.now();
		const runId = await ctx.db.insert('reconciliationRuns', {
			organizationId: args.organizationId,
			bookId: book._id,
			runKey,
			status: 'running',
			startedBy: user._id,
			startedAt: now
		});
		let exceptionCount = 0;
		const [wallets, operations, journals] = await Promise.all([
			ctx.db
				.query('wallets')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.take(250),
			ctx.db
				.query('operations')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', args.organizationId).eq('status', 'succeeded')
				)
				.take(2500),
			ctx.db
				.query('journals')
				.withIndex('by_org_date', (q) => q.eq('organizationId', args.organizationId))
				.take(5000)
		]);
		const journalSources = new Set(journals.map((journal) => journal.sourceKey));
		for (const operation of operations) {
			const sourceKey = `operation:${operation._id}`;
			if (journalSources.has(sourceKey)) continue;
			if (operation.asset === 'ETH') {
				const valuationCase = await ctx.db
					.query('reconciliationCases')
					.withIndex('by_org_status', (q) =>
						q.eq('organizationId', args.organizationId).eq('status', 'open')
					)
					.filter((q) => q.eq(q.field('sourceId'), sourceKey))
					.first();
				if (valuationCase?.kind === 'missingValuation') continue;
			}
			await ctx.db.insert('reconciliationCases', {
				organizationId: args.organizationId,
				runId,
				kind: 'missingJournal',
				sourceType: 'operation',
				sourceId: String(operation._id),
				status: 'open',
				severity: 'blocking',
				title: 'Settled operation is missing a journal',
				details: `Operation ${operation.reference} completed without a matching accounting journal.`,
				createdAt: now
			});
			exceptionCount += 1;
		}
		for (const wallet of wallets) {
			const balances = await ctx.db
				.query('walletBalances')
				.withIndex('by_wallet_asset', (q) => q.eq('walletId', wallet._id))
				.take(20);
			for (const balance of balances) {
				await ctx.db.insert('balanceSnapshots', {
					organizationId: args.organizationId,
					bookId: book._id,
					walletId: wallet._id,
					asset: balance.asset,
					rawValue: balance.rawValue,
					displayValue: balance.displayValue,
					observedAt: balance.observedAt
				});
				if (balance.asset !== 'USDC') continue;
				let ledgerUnits = 0n;
				const walletLines = await ctx.db
					.query('journalLines')
					.withIndex('by_org_account', (q) => q.eq('organizationId', args.organizationId))
					.filter((q) => q.eq(q.field('walletId'), wallet._id))
					.take(5000);
				for (const line of walletLines) {
					const journal = journals.find((item) => item._id === line.journalId);
					if (journal?.status !== 'posted' && journal?.status !== 'reversed') continue;
					ledgerUnits += decimalToUnits(line.debit, 6) - decimalToUnits(line.credit, 6);
				}
				const providerUnits = decimalToUnits(balance.displayValue, 6);
				if (providerUnits === ledgerUnits) continue;
				await ctx.db.insert('reconciliationCases', {
					organizationId: args.organizationId,
					runId,
					kind: 'balanceVariance',
					sourceType: 'wallet',
					sourceId: String(wallet._id),
					status: 'open',
					severity: 'blocking',
					title: `${wallet.name} USDC balance variance`,
					details: `Observed ${balance.displayValue} USDC; posted ledger ${unitsToDecimal((ledgerUnits < 0n ? -ledgerUnits : ledgerUnits).toString(), 6)} ${ledgerUnits < 0n ? 'credit' : 'debit'}.`,
					createdAt: now
				});
				exceptionCount += 1;
			}
		}
		await ctx.db.patch(runId, {
			status: 'completed',
			completedAt: Date.now(),
			exceptionCount
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'accounting.reconciliation_completed',
			resourceType: 'reconciliationRun',
			resourceId: runId,
			correlationId: runKey,
			metadata: { exceptionCount, walletCount: wallets.length, operationCount: operations.length }
		});
		return { runId, exceptionCount };
	}
});

export const backfillLegacyPage = mutation({
	args: {
		organizationId: v.id('organizations'),
		source: v.union(
			v.literal('operations'),
			v.literal('invoices'),
			v.literal('invoicePayments'),
			v.literal('payables')
		),
		paginationOpts: paginationOptsValidator
	},
	returns: v.any(),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'accounting:prepare');
		await ensureAccountingBook(ctx, args.organizationId);
		let posted = 0;
		let skipped = 0;
		let page;
		if (args.source === 'operations') {
			page = await ctx.db
				.query('operations')
				.withIndex('by_org_status', (q) =>
					q.eq('organizationId', args.organizationId).eq('status', 'succeeded')
				)
				.paginate(args.paginationOpts);
			for (const operation of page.page) {
				const before = await journalForSource(
					ctx,
					args.organizationId,
					`operation:${operation._id}`
				);
				await postOperationEntry(ctx, operation);
				if (before) skipped += 1;
				else posted += 1;
			}
		} else if (args.source === 'invoices') {
			page = await ctx.db
				.query('invoices')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.paginate(args.paginationOpts);
			for (const invoice of page.page) {
				if (invoice.status === 'void') {
					skipped += 1;
					continue;
				}
				const sourceKey = `invoice:${invoice._id}:issued`;
				const before = await journalForSource(ctx, args.organizationId, sourceKey);
				await postSourceJournal(ctx, {
					organizationId: args.organizationId,
					sourceKey,
					sourceType: 'invoice',
					amount: invoice.amount,
					asset: invoice.asset,
					postingDate: invoice.createdAt,
					description: `Invoice ${invoice.invoiceNumber} issued`
				});
				if (before) skipped += 1;
				else posted += 1;
			}
		} else if (args.source === 'payables') {
			page = await ctx.db
				.query('payables')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.paginate(args.paginationOpts);
			for (const payable of page.page) {
				if (['draft', 'void'].includes(payable.status)) {
					skipped += 1;
					continue;
				}
				const sourceKey = `payable:${payable._id}:approved`;
				const before = await journalForSource(ctx, args.organizationId, sourceKey);
				await postSourceJournal(ctx, {
					organizationId: args.organizationId,
					sourceKey,
					sourceType: 'payable',
					amount: payable.amount,
					asset: payable.asset,
					postingDate: payable.updatedAt,
					description: `${payable.type === 'bill' ? 'Bill' : 'Expense'} ${payable.reference} approved`
				});
				if (before) skipped += 1;
				else posted += 1;
			}
		} else {
			page = await ctx.db
				.query('invoicePayments')
				.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
				.paginate(args.paginationOpts);
			for (const payment of page.page) {
				const invoice = await ctx.db.get(payment.invoiceId);
				if (!invoice || invoice.organizationId !== args.organizationId) {
					skipped += 1;
					continue;
				}
				const sourceKey = `invoicePayment:${payment._id}`;
				const before = await journalForSource(ctx, args.organizationId, sourceKey);
				const siblings = await ctx.db
					.query('invoicePayments')
					.withIndex('by_invoice', (q) => q.eq('invoiceId', invoice._id))
					.take(500);
				const decimals = assetDecimals(payment.asset);
				const prior = siblings
					.filter(
						(item) =>
							item.receivedAt < payment.receivedAt ||
							(item.receivedAt === payment.receivedAt && String(item._id) < String(payment._id))
					)
					.reduce((sum, item) => sum + decimalToUnits(item.amount, decimals), 0n);
				const amount = decimalToUnits(payment.amount, decimals);
				const outstanding = decimalToUnits(invoice.amount, decimals) - prior;
				const applied = outstanding > 0n ? (amount < outstanding ? amount : outstanding) : 0n;
				const excess = amount - applied;
				await postSourceJournal(ctx, {
					organizationId: args.organizationId,
					sourceKey,
					sourceType: 'invoicePayment',
					amount: payment.amount,
					asset: payment.asset,
					postingDate: payment.receivedAt,
					description: `Invoice ${invoice.invoiceNumber} collection`,
					walletId: payment.walletId,
					receivableAmount: unitsToDecimal(applied.toString(), decimals),
					customerDepositAmount: unitsToDecimal(excess.toString(), decimals)
				});
				if (before) skipped += 1;
				else posted += 1;
			}
		}
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'accounting.legacy_backfill_page',
			resourceType: 'accountingBook',
			resourceId: String((await ensureAccountingBook(ctx, args.organizationId))._id),
			correlationId: `accounting-backfill:${args.organizationId}:${args.source}:${page.continueCursor}`,
			metadata: { source: args.source, posted, skipped, complete: page.isDone }
		});
		return {
			source: args.source,
			posted,
			skipped,
			complete: page.isDone,
			continueCursor: page.continueCursor
		};
	}
});

export const financeReports = query({
	args: { organizationId: v.id('organizations'), asOf: v.number() },
	returns: v.any(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		const [invoiceRows, payableRows, batchRows, caseRows, runs, payrollAccount, journalRows] =
			await Promise.all([
				ctx.db
					.query('invoices')
					.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
					.take(2501),
				ctx.db
					.query('payables')
					.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
					.take(2501),
				ctx.db
					.query('paymentBatches')
					.withIndex('by_org', (q) => q.eq('organizationId', args.organizationId))
					.take(1001),
				ctx.db
					.query('reconciliationCases')
					.withIndex('by_org_status', (q) =>
						q.eq('organizationId', args.organizationId).eq('status', 'open')
					)
					.take(1001),
				ctx.db
					.query('reconciliationRuns')
					.withIndex('by_org_time', (q) => q.eq('organizationId', args.organizationId))
					.order('desc')
					.take(25),
				ctx.db
					.query('chartAccounts')
					.withIndex('by_org_code', (q) =>
						q.eq('organizationId', args.organizationId).eq('code', '2010')
					)
					.unique(),
				ctx.db
					.query('journals')
					.withIndex('by_org_date', (q) =>
						q.eq('organizationId', args.organizationId).lte('postingDate', args.asOf)
					)
					.take(2501)
			]);
		const invoices = invoiceRows.slice(0, 2500);
		const payables = payableRows.slice(0, 2500);
		const batches = batchRows.slice(0, 1000);
		const cases = caseRows.slice(0, 1000);
		const truncated = {
			invoices: invoiceRows.length > 2500,
			payables: payableRows.length > 2500,
			payoutRuns: batchRows.length > 1000,
			exceptions: caseRows.length > 1000,
			journals: false,
			payrollJournalLines: false
		};
		const aging = { current: 0n, days30: 0n, days60: 0n, days90Plus: 0n };
		for (const invoice of invoices) {
			if (['paid', 'void', 'failed'].includes(invoice.status)) continue;
			const open = decimalToUnits(invoice.amount, 6) - decimalToUnits(invoice.paidAmount, 6);
			const days = Math.max(0, Math.floor((args.asOf - invoice.dueAt) / 86_400_000));
			if (days === 0) aging.current += open;
			else if (days <= 30) aging.days30 += open;
			else if (days <= 60) aging.days60 += open;
			else aging.days90Plus += open;
		}
		const openPayables = payables.filter((item) => !['paid', 'void'].includes(item.status));
		const payrollLineRows = payrollAccount
			? await ctx.db
					.query('journalLines')
					.withIndex('by_org_account', (q) =>
						q.eq('organizationId', args.organizationId).eq('accountId', payrollAccount._id)
					)
					.take(5001)
			: [];
		const includedJournals = new Set(
			journalRows
				.slice(0, 2500)
				.filter((journal) => journal.status === 'posted' || journal.status === 'reversed')
				.map((journal) => journal._id)
		);
		const payrollLiabilityUnits = payrollLineRows
			.slice(0, 5000)
			.filter((line) => includedJournals.has(line.journalId))
			.reduce(
				(sum, line) => sum + decimalToUnits(line.credit, 6) - decimalToUnits(line.debit, 6),
				0n
			);
		truncated.journals = journalRows.length > 2500;
		truncated.payrollJournalLines = payrollLineRows.length > 5000;
		return {
			arAging: Object.fromEntries(
				Object.entries(aging).map(([key, value]) => [key, unitsToDecimal(value.toString(), 6)])
			),
			openPayables: openPayables.length,
			payrollLiability: unitsToDecimal(payrollLiabilityUnits.toString(), 6),
			payoutOutcomes: {
				completed: batches.filter((run) => run.status === 'completed').length,
				partial: batches.filter((run) => run.status === 'partiallyCompleted').length,
				failed: batches.filter((run) => run.status === 'failed' || run.status === 'needsAttention')
					.length
			},
			openExceptions: cases.length,
			lastReconciliation: runs[0] ?? null,
			completeness: {
				complete: !Object.values(truncated).some(Boolean),
				truncated,
				asOf: args.asOf
			}
		};
	}
});

export const trialBalance = query({
	args: { organizationId: v.id('organizations'), through: v.number() },
	returns: v.any(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'ledger:read');
		const accountRows = await ctx.db
			.query('chartAccounts')
			.withIndex('by_org_code', (q) => q.eq('organizationId', args.organizationId))
			.take(501);
		const accounts = accountRows.slice(0, 500);
		const journalRows = await ctx.db
			.query('journals')
			.withIndex('by_org_date', (q) =>
				q.eq('organizationId', args.organizationId).lte('postingDate', args.through)
			)
			.take(2501);
		const journals = journalRows.slice(0, 2500);
		const posted = new Set(
			journals
				.filter((journal) => journal.status === 'posted' || journal.status === 'reversed')
				.map((journal) => journal._id)
		);
		const totals = new Map(
			accounts.map((account) => [account._id, { account, debit: 0n, credit: 0n }])
		);
		let lineRowsTruncated = false;
		for (const account of accounts) {
			const lineRows = await ctx.db
				.query('journalLines')
				.withIndex('by_org_account', (q) =>
					q.eq('organizationId', args.organizationId).eq('accountId', account._id)
				)
				.take(5001);
			if (lineRows.length > 5000) lineRowsTruncated = true;
			const lines = lineRows.slice(0, 5000);
			const row = totals.get(account._id)!;
			for (const line of lines)
				if (posted.has(line.journalId)) {
					row.debit += decimalToUnits(line.debit, 6);
					row.credit += decimalToUnits(line.credit, 6);
				}
		}
		const truncated = {
			accounts: accountRows.length > 500,
			journals: journalRows.length > 2500,
			journalLines: lineRowsTruncated
		};
		return {
			rows: [...totals.values()].map(({ account, debit, credit }) => ({
				accountId: account._id,
				code: account.code,
				name: account.name,
				type: account.type,
				debit: unitsToDecimal(debit.toString(), 6),
				credit: unitsToDecimal(credit.toString(), 6)
			})),
			completeness: {
				complete: !Object.values(truncated).some(Boolean),
				truncated,
				through: args.through
			}
		};
	}
});

export const exportJournalEvidencePage = query({
	args: {
		organizationId: v.id('organizations'),
		through: v.number(),
		paginationOpts: paginationOptsValidator
	},
	returns: v.any(),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'audit:read');
		const result = await ctx.db
			.query('journals')
			.withIndex('by_org_date', (q) =>
				q.eq('organizationId', args.organizationId).lte('postingDate', args.through)
			)
			.paginate(args.paginationOpts);
		const page = await Promise.all(
			result.page.map(async (journal) => ({
				journal,
				lines: await ctx.db
					.query('journalLines')
					.withIndex('by_journal', (q) => q.eq('journalId', journal._id))
					.take(500)
			}))
		);
		let debit = 0n;
		let credit = 0n;
		for (const record of page)
			for (const line of record.lines) {
				debit += decimalToUnits(line.debit, 6);
				credit += decimalToUnits(line.credit, 6);
			}
		const ruleIds = [
			...new Set(
				page.flatMap(({ journal }) => (journal.postingRuleId ? [journal.postingRuleId] : []))
			)
		];
		const postingRuleVersions = (
			await Promise.all(ruleIds.map((ruleId) => ctx.db.get(ruleId)))
		).flatMap((rule) => (rule ? [{ id: rule._id, key: rule.key, version: rule.version }] : []));
		const pageChecksum = await sha256(JSON.stringify(page));
		return {
			page,
			continueCursor: result.continueCursor,
			isDone: result.isDone,
			manifest: {
				schemaVersion: 1,
				organizationId: args.organizationId,
				through: args.through,
				recordCount: page.length,
				pageChecksum,
				controlTotals: {
					debit: unitsToDecimal(debit.toString(), 6),
					credit: unitsToDecimal(credit.toString(), 6),
					balanced: debit === credit
				},
				postingRuleVersions,
				complete: result.isDone
			}
		};
	}
});

async function sha256(value: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function journalForSource(
	ctx: Parameters<typeof ensureAccountingBook>[0],
	organizationId: Parameters<typeof ensureAccountingBook>[1],
	sourceKey: string
) {
	return ctx.db
		.query('journals')
		.withIndex('by_source', (q) =>
			q.eq('organizationId', organizationId).eq('sourceKey', sourceKey).eq('version', 1)
		)
		.unique();
}
