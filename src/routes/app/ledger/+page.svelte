<script lang="ts">
	import { AlertTriangle, BookOpenCheck, Check, Download, RefreshCw } from '@lucide/svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const entries = useQuery(api.ledger.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const reconciliation = useQuery(api.ledger.reconciliationSummary, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const rebuildMissing = useMutation(api.ledger.rebuildMissing);
	let tab = $state<'ledger' | 'reconciliation'>('ledger');
	let rebuilding = $state(false);
	let message = $state<string | null>(null);
	let unbalanced = $derived.by(() => {
		const sources = new SvelteMap<string, { debits: number; credits: number }>();
		for (const entry of entries.data ?? []) {
			const item = sources.get(entry.sourceKey) ?? { debits: 0, credits: 0 };
			item[entry.direction === 'debit' ? 'debits' : 'credits'] += 1;
			sources.set(entry.sourceKey, item);
		}
		return [...sources.values()].filter((item) => item.debits !== item.credits).length;
	});

	function csv(value: unknown) {
		return `"${String(value ?? '').replaceAll('"', '""')}"`;
	}
	function exportCsv() {
		const header = [
			'Occurred at',
			'Source',
			'Account',
			'Direction',
			'Asset',
			'Amount',
			'Transaction hash'
		];
		const rows = (entries.data ?? []).map((entry) => [
			new Date(entry.occurredAt).toISOString(),
			entry.sourceKey,
			entry.account,
			entry.direction,
			entry.asset,
			entry.amount,
			entry.transactionHash ?? ''
		]);
		const blob = new Blob([[header, ...rows].map((row) => row.map(csv).join(',')).join('\r\n')], {
			type: 'text/csv;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `ratib-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
	async function rebuild() {
		if (
			!workspace.activeOrganizationId ||
			!confirm(
				'Rebuild missing ledger projections from immutable operations and invoice payment evidence? This does not move funds.'
			)
		)
			return;
		rebuilding = true;
		message = null;
		try {
			const count = await rebuildMissing({ organizationId: workspace.activeOrganizationId });
			message = `Rechecked ${count} source records. Existing ledger lines were left unchanged.`;
		} finally {
			rebuilding = false;
		}
	}
</script>

<svelte:head><title>Ledger and reconciliation | Ratib</title></svelte:head>
<PageHeader
	eyebrow="FINANCIAL EVIDENCE"
	title="Ledger & reconciliation"
	description="A balanced operational projection generated from settled operations and signed invoice deposits."
>
	{#snippet action()}<button
			class="button secondary"
			disabled={!entries.data?.length}
			onclick={exportCsv}><Download size={15} /> Export CSV</button
		>{/snippet}
</PageHeader>

<div class="segmented">
	<button class:active={tab === 'ledger'} onclick={() => (tab = 'ledger')}
		>Operational ledger</button
	><button class:active={tab === 'reconciliation'} onclick={() => (tab = 'reconciliation')}
		>Reconciliation</button
	>
</div>
{#if tab === 'ledger'}<section class="panel ledger-panel">
		<header>
			<div>
				<h2>Posted entries</h2>
				<p>Each source event produces matching debit and credit lines.</p>
			</div>
			<span>{entries.data?.length ?? 0} lines</span>
		</header>
		{#if entries.isLoading}<div class="ledger-empty">
				Loading ledger entries…
			</div>{:else if entries.error}<div class="ledger-empty error">
				{entries.error.message}
			</div>{:else if entries.data?.length === 0}<div class="ledger-empty">
				<BookOpenCheck size={27} /><strong>No settled entries</strong><span
					>Successful transfers and reconciled invoice deposits will post here.</span
				>
			</div>{:else}<div class="table-wrap">
				<table>
					<thead
						><tr
							><th>Occurred</th><th>Source</th><th>Account</th><th>Direction</th><th>Amount</th><th
								>Transaction</th
							></tr
						></thead
					><tbody
						>{#each entries.data ?? [] as entry}<tr
								><td class="mono small">{new Date(entry.occurredAt).toLocaleString()}</td><td
									><strong>{entry.sourceType}</strong><small>{entry.sourceId}</small></td
								><td>{entry.account}</td><td
									><span
										class:debit={entry.direction === 'debit'}
										class:credit={entry.direction === 'credit'}
										class="direction">{entry.direction}</span
									></td
								><td><strong>{entry.amount} {entry.asset}</strong></td><td class="mono small"
									>{entry.transactionHash
										? `${entry.transactionHash.slice(0, 10)}…${entry.transactionHash.slice(-7)}`
										: 'Not reported'}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>{/if}
	</section>
{:else}<div class="reconcile-grid">
		<section class="panel reconcile-score">
			<div
				class:warning={(reconciliation.data?.missingOperationIds.length ?? 0) +
					(reconciliation.data?.missingInvoicePaymentIds.length ?? 0) >
					0 || unbalanced > 0}
			>
				{#if (reconciliation.data?.missingOperationIds.length ?? 0) + (reconciliation.data?.missingInvoicePaymentIds.length ?? 0) === 0 && unbalanced === 0}<Check
						size={26}
					/>{:else}<AlertTriangle size={26} />{/if}
			</div>
			<p class="eyebrow">PROJECTION HEALTH</p>
			<h2>
				{(reconciliation.data?.missingOperationIds.length ?? 0) +
					(reconciliation.data?.missingInvoicePaymentIds.length ?? 0) ===
					0 && unbalanced === 0
					? 'Reconciled'
					: 'Attention required'}
			</h2>
			<p>Ratib compares source evidence to deterministic balanced ledger lines.</p>
			<button class="button primary" disabled={rebuilding} onclick={rebuild}
				><RefreshCw size={14} />{rebuilding ? 'Rebuilding…' : 'Rebuild missing projections'}</button
			>{#if message}<span role="status">{message}</span>{/if}
		</section>
		<section class="panel reconciliation-list">
			<header>
				<div>
					<h2>Control totals</h2>
					<p>Current bounded reconciliation window.</p>
				</div>
			</header>
			<div>
				<span>Successful operations</span><strong
					>{reconciliation.data?.succeededOperations ?? 0}</strong
				>
			</div>
			<div>
				<span>Invoice deposits</span><strong>{reconciliation.data?.invoicePayments ?? 0}</strong>
			</div>
			<div>
				<span>Posted source events</span><strong>{reconciliation.data?.postedSources ?? 0}</strong>
			</div>
			<div>
				<span>Missing operation projections</span><strong
					>{reconciliation.data?.missingOperationIds.length ?? 0}</strong
				>
			</div>
			<div>
				<span>Missing invoice projections</span><strong
					>{reconciliation.data?.missingInvoicePaymentIds.length ?? 0}</strong
				>
			</div>
			<div><span>Unbalanced sources</span><strong>{unbalanced}</strong></div>
			<div>
				<span>Ambiguous automation runs</span><strong
					>{reconciliation.data?.ambiguousRuns ?? 0}</strong
				>
			</div>
		</section>
	</div>{/if}

<style>
	.segmented {
		display: flex;
		width: fit-content;
		margin-bottom: 14px;
		border: 1px solid #d5dee1;
		padding: 3px;
		background: white;
	}
	.segmented button {
		border: 0;
		padding: 7px 14px;
		color: #68777d;
		background: transparent;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.segmented button.active {
		color: #173f4d;
		background: #e7eff1;
	}
	.ledger-panel header > span {
		color: #748188;
		font-size: 0.68rem;
	}
	.ledger-panel td small {
		display: block;
		margin-top: 3px;
		color: #7c898f;
		font-size: 0.57rem;
	}
	.direction {
		display: inline-flex;
		border-radius: 4px;
		padding: 4px 7px;
		font-size: 0.58rem;
		font-weight: 800;
		text-transform: uppercase;
	}
	.direction.debit {
		color: #265e51;
		background: #e0f1eb;
	}
	.direction.credit {
		color: #72531f;
		background: #f7ecd4;
	}
	.ledger-empty {
		display: grid;
		min-height: 280px;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: #738188;
		font-size: 0.72rem;
		text-align: center;
	}
	.ledger-empty :global(svg) {
		color: #387563;
	}
	.ledger-empty strong {
		color: #2d3f46;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.ledger-empty.error {
		color: #9c4038;
	}
	.reconcile-grid {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		gap: 14px;
	}
	.reconcile-score {
		display: grid;
		place-items: center;
		align-content: center;
		min-height: 430px;
		padding: 32px;
		text-align: center;
	}
	.reconcile-score > div {
		display: grid;
		width: 52px;
		height: 52px;
		place-items: center;
		border-radius: 50%;
		color: #24604f;
		background: #def1ea;
	}
	.reconcile-score > div.warning {
		color: #8c5a18;
		background: #fff0d1;
	}
	.reconcile-score .eyebrow {
		margin-top: 18px;
	}
	.reconcile-score h2 {
		margin-top: 9px;
		font-family: Georgia, serif;
		font-size: 1.7rem;
		font-weight: 500;
	}
	.reconcile-score > p:not(.eyebrow) {
		max-width: 370px;
		margin: 8px 0 20px;
		color: #6c7b82;
		font-size: 0.74rem;
		line-height: 1.6;
	}
	.reconcile-score > span {
		margin-top: 12px;
		color: #527169;
		font-size: 0.65rem;
	}
	.reconciliation-list > div {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid #e0e6e8;
		padding: 15px 18px;
		font-size: 0.72rem;
	}
	.reconciliation-list > div span {
		color: #6f7e84;
	}
	.reconciliation-list > div strong {
		font-family: Georgia, serif;
		font-size: 1rem;
	}
	@media (max-width: 800px) {
		.reconcile-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
