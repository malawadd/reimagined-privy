<script lang="ts">
	import { ExternalLink, ListChecks, RefreshCw, Search } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const operations = useQuery(api.operations.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const reconcileOperation = useMutation(api.operations.reconcile);
	let query = $state('');
	let status = $state('all');
	let reconciling = $state<string | null>(null);
	let filtered = $derived(
		(operations.data ?? []).filter((operation) => {
			const text =
				`${operation.reference} ${operation.kind} ${operation.status} ${operation.destination ?? ''} ${operation.correlationId}`.toLowerCase();
			return (
				text.includes(query.toLowerCase()) && (status === 'all' || operation.status === status)
			);
		})
	);
	async function reconcile(id: NonNullable<typeof operations.data>[number]['_id']) {
		if (!workspace.activeOrganizationId) return;
		reconciling = id;
		try {
			await reconcileOperation({ organizationId: workspace.activeOrganizationId, operationId: id });
		} finally {
			reconciling = null;
		}
	}
</script>

<svelte:head><title>Transactions | Ratib</title></svelte:head>
<PageHeader
	eyebrow="OPERATION LIFECYCLE"
	title="Transactions"
	description="Every payment, control intent, provider action, and settlement state in one organization-scoped timeline."
/>
<section class="panel transaction-panel">
	<header>
		<div class="search audit-search">
			<Search size={16} /><input
				bind:value={query}
				aria-label="Search transactions"
				placeholder="Search reference, address, status, or correlation…"
			/>
		</div>
		<select bind:value={status} aria-label="Filter by status"
			><option value="all">All statuses</option><option value="pendingApproval"
				>Pending approval</option
			><option value="pendingConfirmation">Pending confirmation</option><option value="succeeded"
				>Succeeded</option
			><option value="failed">Failed</option><option value="rejected">Rejected</option></select
		>
	</header>
	{#if operations.isLoading}<div class="transaction-empty">
			Loading transaction lifecycle…
		</div>{:else if operations.error}<div class="transaction-empty error">
			{operations.error.message}
		</div>{:else if filtered.length === 0}<div class="transaction-empty">
			<ListChecks size={27} /><strong>No matching operations</strong><span
				>Submitted finance and control workflows will appear here.</span
			>
		</div>{:else}<div class="operation-list">
			{#each filtered as operation}<article>
					<div class="operation-main">
						<span class="kind">{operation.kind}</span><strong>{operation.reference}</strong><small
							>{operation._id} · {new Date(operation.createdAt).toLocaleString()}</small
						>
					</div>
					<div>
						<span>AMOUNT</span><strong
							>{operation.amount && operation.asset
								? `${operation.amount} ${operation.asset}`
								: 'Administrative'}</strong
						>
					</div>
					<div>
						<span>CONTROL PATH</span><strong
							>{operation.approvalPath === 'privyIntent'
								? 'Privy intent'
								: operation.approvalPath === 'automationSigner'
									? 'Policy signer'
									: 'System'}</strong
						>
					</div>
					<StatusBadge status={operation.status} />
					<details>
						<summary>Evidence</summary>
						<dl>
							<div>
								<dt>Correlation</dt>
								<dd>{operation.correlationId}</dd>
							</div>
							{#if operation.destination}<div>
									<dt>Destination</dt>
									<dd>{operation.destination}</dd>
								</div>{/if}{#if operation.memo}<div>
									<dt>Memo</dt>
									<dd>{operation.memo}</dd>
								</div>{/if}{#if operation.errorCode}<div>
									<dt>Error</dt>
									<dd>{operation.errorCode}</dd>
								</div>{/if}
						</dl>
						{#if ['pendingApproval', 'executing', 'pendingConfirmation'].includes(operation.status)}<button
								class="button secondary compact-button"
								disabled={reconciling === operation._id}
								onclick={() => reconcile(operation._id)}
								><RefreshCw size={13} />{reconciling === operation._id
									? 'Queued…'
									: 'Reconcile provider'}</button
							>{/if}{#if operation.status === 'pendingApproval'}<a
								class="button secondary compact-button"
								href="/app/approvals">Approval inbox <ExternalLink size={13} /></a
							>{/if}
					</details>
				</article>{/each}
		</div>{/if}
</section>

<style>
	.transaction-panel > header {
		align-items: center;
	}
	.transaction-panel > header select {
		border: 1px solid #d5dee1;
		padding: 8px 10px;
		background: white;
		font-size: 0.68rem;
	}
	.transaction-empty {
		display: grid;
		min-height: 280px;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: #738188;
		font-size: 0.72rem;
		text-align: center;
	}
	.transaction-empty :global(svg) {
		color: #397563;
	}
	.transaction-empty strong {
		color: #2c3e45;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.transaction-empty.error {
		color: #9c4038;
	}
	.operation-list article {
		display: grid;
		grid-template-columns: 1.5fr 0.7fr 0.8fr auto;
		gap: 18px;
		align-items: center;
		border-bottom: 1px solid #dfe6e8;
		padding: 16px 18px;
	}
	.operation-main strong,
	.operation-main small {
		display: block;
	}
	.operation-main strong {
		margin-top: 5px;
		font-size: 0.74rem;
	}
	.operation-main small {
		margin-top: 4px;
		color: #7b888e;
		font-size: 0.57rem;
	}
	.kind {
		color: #39705f;
		font-size: 0.54rem;
		font-weight: 850;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.operation-list article > div:not(.operation-main) > span {
		display: block;
		color: #839096;
		font-size: 0.52rem;
		font-weight: 800;
		letter-spacing: 0.08em;
	}
	.operation-list article > div:not(.operation-main) > strong {
		display: block;
		margin-top: 5px;
		font-size: 0.67rem;
	}
	.operation-list details {
		grid-column: 1/-1;
	}
	.operation-list summary {
		color: #2b6254;
		font-size: 0.64rem;
		font-weight: 750;
		cursor: pointer;
	}
	.operation-list dl {
		margin: 10px 0;
		border-top: 1px solid #e1e7e9;
	}
	.operation-list dl div {
		display: grid;
		grid-template-columns: 100px 1fr;
		gap: 12px;
		border-bottom: 1px solid #e1e7e9;
		padding: 8px 0;
		font-size: 0.62rem;
	}
	.operation-list dt {
		color: #75838a;
	}
	.operation-list dd {
		margin: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
	}
	.compact-button {
		display: inline-flex;
		height: 30px;
		margin-right: 6px;
		padding: 0 9px;
		font-size: 0.62rem;
	}
	@media (max-width: 750px) {
		.operation-list article {
			grid-template-columns: 1fr 1fr;
		}
		.transaction-panel > header {
			align-items: stretch;
			flex-direction: column;
			gap: 8px;
		}
	}
</style>
