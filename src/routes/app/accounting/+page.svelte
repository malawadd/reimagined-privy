<script lang="ts">
	import { AlertTriangle, BookOpenCheck, Check, LockKeyhole, RefreshCw } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const data = useQuery(api.accounting.workspace, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const balance = useQuery(api.accounting.trialBalance, () =>
		workspace.activeOrganizationId
			? { organizationId: workspace.activeOrganizationId, through: Date.now() }
			: 'skip'
	);
	const financeReports = useQuery(api.accounting.financeReports, () =>
		workspace.activeOrganizationId
			? { organizationId: workspace.activeOrganizationId, asOf: Date.now() }
			: 'skip'
	);
	const checklist = useQuery(api.accounting.listChecklist, () => {
		const periodId = data.data?.periods[0]?._id;
		return workspace.activeOrganizationId && periodId
			? { organizationId: workspace.activeOrganizationId, periodId }
			: 'skip';
	});
	const initialize = useMutation(api.accounting.initialize);
	const createPeriod = useMutation(api.accounting.createPeriod);
	const setPeriodStatus = useMutation(api.accounting.setPeriodStatus);
	const resolveCase = useMutation(api.accounting.resolveCase);
	const runReconciliation = useMutation(api.accounting.runReconciliation);
	const backfillLegacyPage = useMutation(api.accounting.backfillLegacyPage);
	const setChecklistItem = useMutation(api.accounting.setChecklistItem);

	let tab = $state<'overview' | 'journals' | 'reconciliation' | 'reports' | 'close'>('overview');
	let busy = $state(false);
	let message = $state<string | null>(null);

	async function setup() {
		if (!workspace.activeOrganizationId) return;
		busy = true;
		message = null;
		try {
			await initialize({ organizationId: workspace.activeOrganizationId });
			message = 'Primary accounting book and conservative chart of accounts are ready.';
		} catch (caught) {
			message = caught instanceof Error ? caught.message : 'Accounting setup failed.';
		} finally {
			busy = false;
		}
	}

	async function openCurrentPeriod() {
		if (!workspace.activeOrganizationId) return;
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
		await createPeriod({
			organizationId: workspace.activeOrganizationId,
			label: now.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
			startsAt: start,
			endsAt: end
		});
	}

	async function lockPeriod(periodId: string) {
		if (
			!workspace.activeOrganizationId ||
			!confirm('Lock this period after all blocking exceptions are cleared?')
		)
			return;
		await setPeriodStatus({
			organizationId: workspace.activeOrganizationId,
			periodId: periodId as never,
			status: 'locked'
		});
	}

	async function resolve(caseId: string) {
		if (!workspace.activeOrganizationId) return;
		const resolution = prompt('Describe the evidence used to resolve this exception:');
		if (!resolution) return;
		await resolveCase({
			organizationId: workspace.activeOrganizationId,
			caseId: caseId as never,
			resolution,
			waive: false
		});
	}

	async function reconcile() {
		if (!workspace.activeOrganizationId) return;
		busy = true;
		try {
			const result = await runReconciliation({
				organizationId: workspace.activeOrganizationId,
				requestKey: crypto.randomUUID()
			});
			message = `Reconciliation completed with ${result.exceptionCount} exception${result.exceptionCount === 1 ? '' : 's'}.`;
		} catch (caught) {
			message = caught instanceof Error ? caught.message : 'Reconciliation failed.';
		} finally {
			busy = false;
		}
	}

	async function backfillLegacy() {
		if (!workspace.activeOrganizationId) return;
		busy = true;
		message = null;
		let posted = 0;
		try {
			for (const source of ['operations', 'invoices', 'invoicePayments', 'payables'] as const) {
				let cursor: string | null = null;
				let complete = false;
				while (!complete) {
					const result = await backfillLegacyPage({
						organizationId: workspace.activeOrganizationId,
						source,
						paginationOpts: { cursor, numItems: 25 }
					});
					posted += result.posted;
					complete = result.complete;
					cursor = result.continueCursor;
				}
			}
			message = `Legacy evidence backfill completed. ${posted} journal${posted === 1 ? '' : 's'} posted; existing journals were preserved.`;
		} catch (caught) {
			message = caught instanceof Error ? caught.message : 'Legacy accounting backfill failed.';
		} finally {
			busy = false;
		}
	}

	async function completeChecklist(itemId: string) {
		if (!workspace.activeOrganizationId) return;
		await setChecklistItem({
			organizationId: workspace.activeOrganizationId,
			itemId: itemId as never,
			status: 'completed'
		});
	}
</script>

<svelte:head><title>Accounting | Ratib</title></svelte:head>
<PageHeader
	eyebrow="CONTROLLED SUBLEDGER"
	title="Accounting"
	description="Reviewed journals, reconciliation exceptions, period controls, and source evidence."
>
	{#snippet action()}
		{#if !data.data?.book}<button class="button primary" disabled={busy} onclick={setup}
				><BookOpenCheck size={15} /> {busy ? 'Initializing…' : 'Initialize accounting'}</button
			>{:else}<button class="button secondary" onclick={openCurrentPeriod}
				><RefreshCw size={15} /> Open current period</button
			>{/if}
	{/snippet}
</PageHeader>

{#if message}<div class="notice" role="status">{message}</div>{/if}

{#if data.isLoading}<div class="empty">Loading accounting workspace…</div>
{:else if data.error}<div class="empty error" role="alert">{data.error.message}</div>
{:else if !data.data?.book}<section class="empty setup">
		<BookOpenCheck size={30} />
		<strong>No accounting book yet</strong>
		<span>Initialize a controlled USD book without changing the existing operational ledger.</span>
	</section>
{:else}
	<div class="segmented" aria-label="Accounting views">
		<button class:active={tab === 'overview'} onclick={() => (tab = 'overview')}>Overview</button>
		<button class:active={tab === 'journals'} onclick={() => (tab = 'journals')}>Journals</button>
		<button class:active={tab === 'reconciliation'} onclick={() => (tab = 'reconciliation')}
			>Exceptions</button
		>
		<button class:active={tab === 'reports'} onclick={() => (tab = 'reports')}>Reports</button>
		<button class:active={tab === 'close'} onclick={() => (tab = 'close')}>Close</button>
	</div>

	{#if tab === 'overview'}
		<div class="metrics">
			<div>
				<span>Book</span><strong>{data.data.book.name}</strong><small
					>{data.data.book.functionalCurrency}</small
				>
			</div>
			<div>
				<span>Posting accounts</span><strong
					>{data.data.accounts.filter((item: { isPosting: boolean }) => item.isPosting)
						.length}</strong
				><small>versioned chart</small>
			</div>
			<div>
				<span>Posted journals</span><strong
					>{data.data.journals.filter((item: { status: string }) => item.status === 'posted')
						.length}</strong
				><small>immutable evidence</small>
			</div>
			<div>
				<span>Open exceptions</span><strong>{data.data.cases.length}</strong><small
					>close blockers included</small
				>
			</div>
		</div>
		<section class="panel">
			<header>
				<div>
					<h2>Trial balance</h2>
					<p>Functional-currency postings through today.</p>
				</div>
				<button class="button secondary" disabled={busy} onclick={backfillLegacy}
					><RefreshCw size={14} /> Backfill legacy evidence</button
				>
			</header>
			<div class="table-wrap">
				<table>
					<thead><tr><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th></tr></thead>
					<tbody
						>{#each balance.data?.rows ?? [] as row}<tr
								><td><strong>{row.code}</strong> {row.name}</td><td>{row.type}</td><td class="mono"
									>{row.debit}</td
								><td class="mono">{row.credit}</td></tr
							>{/each}</tbody
					>
				</table>
			</div>
			{#if balance.data && !balance.data.completeness.complete}<p class="report-warning">
					Trial balance limits were reached. Use paginated evidence exports before close.
				</p>{/if}
		</section>
	{:else if tab === 'journals'}
		<section class="panel">
			<header>
				<div>
					<h2>Journal activity</h2>
					<p>Source-linked entries are posted once and corrected by reversal.</p>
				</div>
			</header>
			{#if data.data.journals.length === 0}<div class="empty">
					No accounting journals have posted.
				</div>{:else}<div class="table-wrap">
					<table>
						<thead><tr><th>Date</th><th>Source</th><th>Description</th><th>Status</th></tr></thead
						><tbody>
							{#each data.data.journals as journal}<tr
									><td class="mono">{new Date(journal.postingDate).toLocaleDateString()}</td><td
										><strong>{journal.sourceType}</strong><small>{journal.sourceKey}</small></td
									><td>{journal.description}</td><td
										><span class="status">{journal.status}</span></td
									></tr
								>{/each}
						</tbody>
					</table>
				</div>{/if}
		</section>
	{:else if tab === 'reconciliation'}
		<section class="panel">
			<header>
				<div>
					<h2>Exception queue</h2>
					<p>Every unresolved variance has an owner and evidence trail.</p>
				</div>
				<button class="button secondary" disabled={busy} onclick={reconcile}
					><RefreshCw size={14} /> Reconcile now</button
				>
			</header>
			{#if data.data.cases.length === 0}<div class="empty success">
					<Check size={25} />No open exceptions
				</div>{:else}<div class="case-list">
					{#each data.data.cases as item}<article>
							<AlertTriangle size={18} />
							<div>
								<strong>{item.title}</strong><span>{item.details}</span><small
									>{item.kind} · {item.severity}</small
								>
							</div>
							<button class="button secondary" onclick={() => resolve(item._id)}>Resolve</button>
						</article>{/each}
				</div>{/if}
		</section>
	{:else if tab === 'reports'}
		<div class="metrics report-grid">
			<div>
				<span>AR current</span><strong>{financeReports.data?.arAging.current ?? '0'}</strong><small
					>USDC</small
				>
			</div>
			<div>
				<span>AR 90+ days</span><strong>{financeReports.data?.arAging.days90Plus ?? '0'}</strong
				><small>USDC overdue</small>
			</div>
			<div>
				<span>Payroll liability</span><strong>{financeReports.data?.payrollLiability ?? '0'}</strong
				><small>USDC open runs</small>
			</div>
			<div>
				<span>Open payables</span><strong>{financeReports.data?.openPayables ?? 0}</strong><small
					>bills and expenses</small
				>
			</div>
		</div>
		<section class="panel">
			<header>
				<div>
					<h2>Control report</h2>
					<p>Reconciliation and payout outcomes with explicit completeness boundaries.</p>
				</div>
			</header>
			<div class="report-list">
				<p>
					<span>Completed payout runs</span><strong
						>{financeReports.data?.payoutOutcomes.completed ?? 0}</strong
					>
				</p>
				<p>
					<span>Partial payout runs</span><strong
						>{financeReports.data?.payoutOutcomes.partial ?? 0}</strong
					>
				</p>
				<p>
					<span>Failed or attention required</span><strong
						>{financeReports.data?.payoutOutcomes.failed ?? 0}</strong
					>
				</p>
				<p>
					<span>Open accounting exceptions</span><strong
						>{financeReports.data?.openExceptions ?? 0}</strong
					>
				</p>
			</div>
			{#if financeReports.data && !financeReports.data.completeness.complete}<p
					class="report-warning"
				>
					This summary reached one or more query limits and is explicitly incomplete.
				</p>{/if}
		</section>
	{:else}
		<section class="panel">
			<header>
				<div>
					<h2>Accounting periods</h2>
					<p>Locking is blocked while material exceptions remain open.</p>
				</div>
			</header>
			{#if data.data.periods.length === 0}<div class="empty">
					Open the current month to begin a close checklist.
				</div>{:else}<div class="period-list">
					{#each data.data.periods as period}<article>
							<div>
								<strong>{period.label}</strong><span
									>{new Date(period.startsAt).toLocaleDateString()} – {new Date(
										period.endsAt
									).toLocaleDateString()}</span
								>
							</div>
							<span class="status">{period.status}</span>{#if period.status !== 'locked'}<button
									class="button secondary"
									onclick={() => lockPeriod(period._id)}><LockKeyhole size={14} /> Lock</button
								>{/if}
						</article>{/each}
				</div>
				<div class="checklist">
					{#each checklist.data ?? [] as item}<label
							><input
								type="checkbox"
								checked={item.status !== 'open'}
								disabled={item.status !== 'open'}
								onchange={() => completeChecklist(item._id)}
							/><span>{item.label}</span><small>{item.status}</small></label
						>{/each}
				</div>
			{/if}
		</section>
	{/if}
{/if}

<style>
	.segmented {
		display: flex;
		width: fit-content;
		border: 1px solid #d5dee1;
		padding: 3px;
		background: #fff;
		margin-bottom: 14px;
	}
	.segmented button {
		border: 0;
		background: transparent;
		padding: 7px 14px;
		color: #68777d;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.segmented button.active {
		background: #e7eff1;
		color: #173f4d;
	}
	.notice {
		border-left: 3px solid #25869a;
		background: #eef7f7;
		padding: 10px 12px;
		margin-bottom: 14px;
		font-size: 0.72rem;
	}
	.metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border: 1px solid #d9e1e3;
		background: #fff;
		margin-bottom: 14px;
	}
	.metrics div {
		padding: 16px;
		border-right: 1px solid #e2e8e9;
	}
	.metrics div:last-child {
		border-right: 0;
	}
	.metrics span,
	.metrics small {
		display: block;
		color: #718087;
		font-size: 0.62rem;
	}
	.metrics strong {
		display: block;
		margin: 7px 0;
		font-size: 1.15rem;
	}
	.panel {
		border: 1px solid #d9e1e3;
		background: #fff;
	}
	.panel header {
		padding: 15px 17px;
		border-bottom: 1px solid #e3e9ea;
	}
	.panel h2 {
		margin: 0;
		font-size: 0.92rem;
	}
	.panel p {
		margin: 4px 0 0;
		color: #718087;
		font-size: 0.68rem;
	}
	.table-wrap {
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.68rem;
	}
	th,
	td {
		text-align: left;
		padding: 11px 14px;
		border-bottom: 1px solid #edf0f1;
	}
	th {
		font-size: 0.58rem;
		text-transform: uppercase;
		color: #718087;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	td small {
		display: block;
		color: #7c898f;
		margin-top: 3px;
	}
	.status {
		display: inline-flex;
		padding: 4px 7px;
		border: 1px solid #cad7da;
		background: #f4f8f8;
		font-size: 0.58rem;
		text-transform: capitalize;
	}
	.empty {
		min-height: 150px;
		display: flex;
		gap: 8px;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px dashed #ccd8da;
		background: #fff;
		color: #718087;
		font-size: 0.7rem;
	}
	.empty.setup {
		min-height: 260px;
	}
	.empty strong {
		color: #263a40;
		font-size: 0.82rem;
	}
	.empty.success {
		color: #216c58;
		border: 0;
	}
	.error {
		color: #9d3939;
	}
	.case-list article,
	.period-list article {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 16px;
		border-bottom: 1px solid #e7ecec;
	}
	.case-list article > div,
	.period-list article > div {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-direction: column;
		gap: 3px;
	}
	.case-list span,
	.period-list span,
	.case-list small {
		color: #718087;
		font-size: 0.64rem;
	}
	@media (max-width: 800px) {
		.metrics {
			grid-template-columns: 1fr 1fr;
		}
		.metrics div:nth-child(2) {
			border-right: 0;
		}
		.segmented {
			width: 100%;
			overflow: auto;
		}
		.segmented button {
			flex: 1;
		}
		.case-list article,
		.period-list article {
			align-items: flex-start;
			flex-wrap: wrap;
		}
	}
	.panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.report-list {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.report-list p {
		display: flex;
		justify-content: space-between;
		margin: 0;
		padding: 14px 16px;
		border-bottom: 1px solid #e7ecec;
	}
	.report-list span {
		color: #718087;
		font-size: 0.66rem;
	}
	.report-warning {
		margin: 12px 16px 16px;
		padding: 10px 12px;
		border-left: 3px solid #a96816;
		background: #fff8eb;
		color: #75480d;
		font-size: 0.72rem;
	}
	.checklist {
		border-top: 1px solid #e7ecec;
	}
	.checklist label {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 10px;
		align-items: center;
		padding: 11px 16px;
		border-bottom: 1px solid #edf0f1;
		font-size: 0.68rem;
	}
	.checklist small {
		color: #718087;
		text-transform: capitalize;
	}
	@media (max-width: 600px) {
		.report-list {
			grid-template-columns: 1fr;
		}
		.panel header {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
