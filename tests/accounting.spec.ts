import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');

async function setup() {
	const t = convexTest(schema, modules);
	const preparer = t.withIdentity({
		subject: 'did:privy:accounting-preparer',
		email: 'prepare@example.com'
	});
	const reviewer = t.withIdentity({
		subject: 'did:privy:accounting-reviewer',
		email: 'review@example.com'
	});
	const preparerId = await preparer.mutation(api.users.syncCurrent, {});
	const reviewerId = await reviewer.mutation(api.users.syncCurrent, {});
	const organizationId = await t.run(async (ctx) => {
		const id = await ctx.db.insert('organizations', {
			name: 'Accounting Test',
			slug: `accounting-${crypto.randomUUID()}`,
			createdByUserId: preparerId,
			active: true
		});
		await ctx.db.insert('memberships', {
			organizationId: id,
			userId: preparerId,
			role: 'owner',
			status: 'active'
		});
		await ctx.db.insert('memberships', {
			organizationId: id,
			userId: reviewerId,
			role: 'approver',
			status: 'active'
		});
		return id;
	});
	return { t, preparer, reviewer, organizationId };
}

describe('accounting workflow', () => {
	it('initializes a chart, requires a separate reviewer, and posts a balanced journal', async () => {
		const { t, preparer, reviewer, organizationId } = await setup();
		await preparer.mutation(api.accounting.initialize, { organizationId });
		const workspace = await preparer.query(api.accounting.workspace, { organizationId });
		const treasury = workspace.accounts.find(
			(account: { code: string }) => account.code === '1000'
		);
		const revenue = workspace.accounts.find((account: { code: string }) => account.code === '4000');
		if (!treasury || !revenue) throw new Error('Default accounting accounts were not created.');
		const journalId = await preparer.mutation(api.accounting.createManualJournal, {
			organizationId,
			postingDate: Date.now(),
			description: 'Customer receipt adjustment',
			lines: [
				{ accountId: treasury._id, debit: '25', credit: '0' },
				{ accountId: revenue._id, debit: '0', credit: '25' }
			]
		});
		await expect(
			preparer.mutation(api.accounting.postManualJournal, { organizationId, journalId })
		).rejects.toThrow('different reviewer');
		await reviewer.mutation(api.accounting.postManualJournal, { organizationId, journalId });
		const lines = await reviewer.query(api.accounting.listLines, { organizationId, journalId });
		expect(lines).toHaveLength(2);
		expect(
			lines.map((line: { debit: string; credit: string }) => [line.debit, line.credit])
		).toEqual([
			['25', '0'],
			['0', '25']
		]);
		const reversalId = await preparer.mutation(api.accounting.reverse, {
			organizationId,
			journalId,
			reason: 'Correct the source classification'
		});
		const preparedReversal = await preparer.query(api.accounting.listLines, {
			organizationId,
			journalId: reversalId
		});
		expect(
			preparedReversal.map((line: { debit: string; credit: string }) => [line.debit, line.credit])
		).toEqual([
			['0', '25'],
			['25', '0']
		]);
		await expect(
			preparer.mutation(api.accounting.postManualJournal, {
				organizationId,
				journalId: reversalId
			})
		).rejects.toThrow('different reviewer');
		await reviewer.mutation(api.accounting.postManualJournal, {
			organizationId,
			journalId: reversalId
		});
		const statuses = await t.run(async (ctx) => ({
			original: (await ctx.db.get(journalId))?.status,
			reversal: (await ctx.db.get(reversalId))?.status
		}));
		expect(statuses).toEqual({ original: 'reversed', reversal: 'posted' });
		const trialBalance = await reviewer.query(api.accounting.trialBalance, {
			organizationId,
			through: Date.now()
		});
		const treasuryBalance = trialBalance.rows.find(
			(row: { code: string }) => row.code === treasury.code
		);
		expect(treasuryBalance).toMatchObject({ debit: '25', credit: '25' });
		const exportPage = await reviewer.query(api.accounting.exportJournalEvidencePage, {
			organizationId,
			through: Date.now(),
			paginationOpts: { numItems: 50, cursor: null }
		});
		expect(exportPage.manifest).toMatchObject({
			schemaVersion: 1,
			recordCount: 2,
			complete: true,
			controlTotals: { debit: '50', credit: '50', balanced: true }
		});
		expect(exportPage.manifest.pageChecksum).toMatch(/^[a-f0-9]{64}$/);
	}, 15_000);

	it('prevents an outsider from reading accounting data', async () => {
		const { t, organizationId } = await setup();
		const outsider = t.withIdentity({
			subject: 'did:privy:accounting-outsider',
			email: 'outside@example.com'
		});
		await outsider.mutation(api.users.syncCurrent, {});
		await expect(outsider.query(api.accounting.workspace, { organizationId })).rejects.toThrow(
			'Organization access denied'
		);
	});
});
