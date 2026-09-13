<script lang="ts">
	import { BarChart3, Download, FileBarChart } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { workspace } from '$lib/workspace.svelte';

	let days = $state<30 | 90 | 365>(30);
	const summary = useQuery(api.reports.financeSummary, () =>
		workspace.activeOrganizationId
			? {
					organizationId: workspace.activeOrganizationId,
					from: Date.now() - days * 86_400_000,
					to: Date.now()
				}
			: 'skip'
	);

	function total(
		rows: { asset: 'ETH' | 'USDC'; amount: string }[] | undefined,
		asset: 'ETH' | 'USDC'
	) {
		return rows?.find((row) => row.asset === asset)?.amount ?? '0';
	}
	function exportCsv() {
		if (!summary.data) return;
		const rows = [
			['Metric', 'Asset', 'Amount'],
			['Inflows', 'USDC', total(summary.data.inflows, 'USDC')],
			['Inflows', 'ETH', total(summary.data.inflows, 'ETH')],
			['Outflows', 'USDC', total(summary.data.outflows, 'USDC')],
			['Outflows', 'ETH', total(summary.data.outflows, 'ETH')],
			['Outstanding receivables', 'USDC', total(summary.data.outstandingReceivables, 'USDC')],
			['Outstanding receivables', 'ETH', total(summary.data.outstandingReceivables, 'ETH')],
			['Open payables', 'USDC', total(summary.data.openPayables, 'USDC')],
			['Open payables', 'ETH', total(summary.data.openPayables, 'ETH')]
		];
		const blob = new Blob(
			[rows.map((row) => row.map((value) => `"${value}"`).join(',')).join('\r\n')],
			{
				type: 'text/csv;charset=utf-8'
			}
		);
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `ratib-finance-report-${days}d.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Reports | Ratib</title></svelte:head>
<PageHeader
	eyebrow="FINANCE REPORTING"
	title="Reports"
	description="Live operating totals derived from organization-scoped source records and balanced journal entries."
>
	{#snippet action()}<button
			class="button secondary"
			type="button"
			onclick={exportCsv}
			disabled={!summary.data}><Download size={15} /> Export CSV</button
		>{/snippet}
</PageHeader>

<div class="report-toolbar">
	<div class="segmented" aria-label="Report period">
		{#each [30, 90, 365] as option}<button
				class:active={days === option}
				type="button"
				onclick={() => (days = option as 30 | 90 | 365)}>{option} days</button
			>{/each}
	</div>
	<span>Base Sepolia · Operational ledger basis</span>
</div>

{#if summary.isLoading}
	<section class="panel empty-state">
		<BarChart3 size={26} />
		<h2>Calculating report</h2>
	</section>
{:else if summary.error}
	<section class="panel empty-state" role="alert">
		<FileBarChart size={26} />
		<h2>Report unavailable</h2>
		<p>{summary.error.message}</p>
	</section>
{:else if summary.data}
	<section class="metrics four">
		<div class="metric">
			<div>
				<span>USDC inflows</span><strong>{total(summary.data.inflows, 'USDC')}</strong><small
					>Verified wallet debits</small
				>
			</div>
		</div>
		<div class="metric">
			<div>
				<span>USDC outflows</span><strong>{total(summary.data.outflows, 'USDC')}</strong><small
					>Settled wallet credits</small
				>
			</div>
		</div>
		<div class="metric">
			<div>
				<span>Receivables</span><strong
					>{total(summary.data.outstandingReceivables, 'ETH')} ETH</strong
				><small>{total(summary.data.outstandingReceivables, 'USDC')} USDC outstanding</small>
			</div>
		</div>
		<div class="metric">
			<div>
				<span>Open payables</span><strong>{total(summary.data.openPayables, 'ETH')} ETH</strong
				><small>{total(summary.data.openPayables, 'USDC')} USDC open</small>
			</div>
		</div>
	</section>
	<section class="panel operation-report">
		<header>
			<div>
				<h2>Operation outcomes</h2>
				<p>
					{new Date(summary.data.from).toLocaleDateString()} – {new Date(
						summary.data.to
					).toLocaleDateString()}
				</p>
			</div>
			<strong>{summary.data.operationCount} total</strong>
		</header>
		<div class="outcome-grid">
			<div><span>Succeeded</span><strong>{summary.data.succeededCount}</strong></div>
			<div><span>In progress</span><strong>{summary.data.pendingCount}</strong></div>
			<div><span>Unsuccessful</span><strong>{summary.data.failedCount}</strong></div>
			<div>
				<span>ETH movement</span><strong
					>{total(summary.data.inflows, 'ETH')} in / {total(summary.data.outflows, 'ETH')} out</strong
				>
			</div>
		</div>
	</section>
{/if}

<style>
	.report-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}
	.report-toolbar > span {
		color: #6d7a87;
		font-size: 0.76rem;
	}
	.segmented {
		display: inline-flex;
		border: 1px solid #d9dfe5;
		border-radius: 6px;
		padding: 3px;
		background: white;
	}
	.segmented button {
		min-width: 76px;
		border: 0;
		border-radius: 4px;
		padding: 8px 10px;
		color: #6d7a87;
		background: transparent;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.segmented button.active {
		color: white;
		background: #143c4d;
	}
	.operation-report {
		margin-top: 20px;
	}
	.operation-report header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #d9dfe5;
		padding-bottom: 18px;
	}
	.operation-report h2 {
		font-family: Georgia, serif;
		font-size: 1.25rem;
		font-weight: 500;
	}
	.operation-report p {
		margin-top: 4px;
		color: #6d7a87;
		font-size: 0.75rem;
	}
	.operation-report header > strong {
		color: #28715b;
		font-size: 0.8rem;
	}
	.outcome-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}
	.outcome-grid div {
		min-width: 0;
		border-right: 1px solid #d9dfe5;
		padding: 24px;
	}
	.outcome-grid div:last-child {
		border: 0;
	}
	.outcome-grid span,
	.outcome-grid strong {
		display: block;
	}
	.outcome-grid span {
		color: #6d7a87;
		font-size: 0.72rem;
	}
	.outcome-grid strong {
		margin-top: 8px;
		overflow-wrap: anywhere;
		font-size: 1.1rem;
	}
	@media (max-width: 760px) {
		.report-toolbar {
			align-items: flex-start;
			flex-direction: column;
		}
		.outcome-grid {
			grid-template-columns: 1fr 1fr;
		}
		.outcome-grid div {
			border-bottom: 1px solid #d9dfe5;
		}
		.outcome-grid div:nth-child(2) {
			border-right: 0;
		}
	}
</style>
