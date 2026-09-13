<script lang="ts">
	import {
		AlertTriangle,
		Check,
		FileCheck2,
		Pencil,
		Play,
		RefreshCw,
		RotateCcw,
		Send
	} from '@lucide/svelte';
	import StatusBadge from './StatusBadge.svelte';

	type Attempt = {
		status: string;
		attemptKey: string;
		providerKind: 'privyAction' | 'privyIntent';
		providerReferenceId?: string;
		errorCode?: string;
	} | null;
	type Run = {
		batch: {
			_id: string;
			asset: 'ETH' | 'USDC';
			name: string;
			totalAmount: string;
			itemCount: number;
			status: string;
			createdAt: number;
			requestKey?: string;
			sourceWalletId: string;
			scheduledFor?: number;
			payPeriodStart?: string;
			payPeriodEnd?: string;
			payDate?: string;
			payrollKind?: 'regular' | 'offCycle';
		};
		items: Array<{
			_id: string;
			label: string;
			destination: string;
			amount: string;
			status: string;
			routeReason?: string;
			failureCode?: string;
			recipientId?: string;
			userId?: string;
			memo?: string;
			sourceRow?: number;
			payslipSnapshot?: {
				grossAmount: string;
				deductionAmount: string;
				netAmount: string;
				denominationCurrency: string;
			};
			attempt: Attempt;
		}>;
	};

	let {
		runs,
		emptyMessage,
		onRetry,
		onReconcile,
		onFinalize,
		onSubmit,
		onApprove,
		onDispatch,
		onEdit,
		onDuplicate
	}: {
		runs: Run[];
		emptyMessage: string;
		onRetry: (itemId: string) => void;
		onReconcile: (itemId: string) => void;
		onFinalize: (batchId: string) => void;
		onSubmit: (batchId: string) => void;
		onApprove: (batchId: string) => void;
		onDispatch: (batchId: string) => void;
		onEdit: (run: Run) => void;
		onDuplicate: (run: Run) => void;
	} = $props();
</script>

{#if runs.length === 0}
	<div class="empty">{emptyMessage}</div>
{:else}
	<div class="runs">
		{#each runs as row}
			<article>
				<header>
					<div>
						<strong>{row.batch.name}</strong>
						<small>{new Date(row.batch.createdAt).toLocaleString()}</small>
					</div>
					<div><span>TOTAL</span><strong>{row.batch.totalAmount} {row.batch.asset}</strong></div>
					<div><span>ITEMS</span><strong>{row.batch.itemCount}</strong></div>
					<StatusBadge status={row.batch.status} />
					<div class="run-actions">
						<button title="Duplicate run" onclick={() => onDuplicate(row)}
							><RotateCcw size={14} /> Duplicate</button
						>
						{#if row.batch.status === 'draft'}
							<button title="Edit draft" onclick={() => onEdit(row)}
								><Pencil size={14} /> Edit</button
							>
							<button title="Finalize draft" onclick={() => onFinalize(row.batch._id)}
								><FileCheck2 size={14} /> Finalize</button
							>
						{:else if row.batch.status === 'ready'}
							<button title="Submit for approval" onclick={() => onSubmit(row.batch._id)}
								><Send size={14} /> Submit</button
							>
						{:else if row.batch.status === 'pendingApproval'}
							<button title="Approve payout run" onclick={() => onApprove(row.batch._id)}
								><Check size={14} /> Approve</button
							>
						{:else if row.batch.status === 'approved'}
							<button title="Dispatch payout run" onclick={() => onDispatch(row.batch._id)}
								><Play size={14} /> Dispatch</button
							>
						{/if}
					</div>
				</header>
				{#if row.batch.payPeriodStart}<p class="metadata">
						{row.batch.payrollKind === 'offCycle' ? 'Off-cycle' : 'Regular'} pay period {row.batch
							.payPeriodStart} to {row.batch.payPeriodEnd} · Pay date {row.batch.payDate}
					</p>{/if}
				{#if row.batch.status === 'scheduled' && row.batch.scheduledFor}<p class="metadata">
						Scheduled for {new Date(row.batch.scheduledFor).toLocaleString()}
					</p>{/if}
				{#if row.batch.status === 'needsAttention'}
					<p class="attention">
						<AlertTriangle size={14} /> Provider outcome is uncertain. Reconcile before retrying.
					</p>
				{/if}
				<details>
					<summary>Inspect payments</summary>
					<div class="items">
						{#each row.items as item}
							<div class="item">
								<div>
									<strong>{item.label}</strong>
									<code>{item.destination}</code>
								</div>
								<div><span>AMOUNT</span><strong>{item.amount} {row.batch.asset}</strong></div>
								<div>
									<span>ROUTE</span><small
										>{item.attempt?.providerKind === 'privyAction'
											? 'Policy signer'
											: 'Privy intent'}</small
									>
								</div>
								<StatusBadge status={item.status} />
								<div class="actions">
									{#if item.status === 'failed' || item.status === 'cancelled'}
										<button
											title="Retry payout"
											aria-label={`Retry ${item.label}`}
											onclick={() => onRetry(item._id)}><RotateCcw size={14} /></button
										>
									{:else if item.status === 'ambiguous' || item.status === 'pendingApproval' || item.status === 'processing'}
										<button
											title="Reconcile payout"
											aria-label={`Reconcile ${item.label}`}
											onclick={() => onReconcile(item._id)}><RefreshCw size={14} /></button
										>
									{/if}
								</div>
								{#if item.routeReason}<p>{item.routeReason}</p>{/if}
								{#if item.payslipSnapshot}<p class="payslip">
										Gross {item.payslipSnapshot.grossAmount} · Deductions {item.payslipSnapshot
											.deductionAmount} · Net {item.payslipSnapshot.netAmount}
										{item.payslipSnapshot.denominationCurrency}
									</p>{/if}
								{#if item.failureCode}<p class="error">{item.failureCode}</p>{/if}
							</div>
						{/each}
					</div>
				</details>
			</article>
		{/each}
	</div>
{/if}

<style>
	.empty {
		display: grid;
		min-height: 220px;
		place-items: center;
		color: #738188;
		font-size: 0.74rem;
	}
	.runs article {
		border-bottom: 1px solid #dfe6e8;
		padding: 16px 18px;
	}
	.runs article > header {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) auto auto auto auto;
		gap: 22px;
		align-items: center;
	}
	.run-actions button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 1px solid #b9d1c8;
		border-radius: 5px;
		padding: 6px 8px;
		color: #276052;
		background: white;
		font-size: 0.62rem;
		font-weight: 750;
	}
	.metadata {
		margin: 8px 0 0;
		color: #6d7d83;
		font-size: 0.62rem;
	}
	header div > span,
	.item div > span {
		display: block;
		color: #819096;
		font-size: 0.54rem;
		font-weight: 800;
	}
	header small,
	.item small,
	.item code {
		display: block;
		margin-top: 4px;
		color: #74838a;
		font-size: 0.58rem;
	}
	.item code {
		max-width: 250px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	details {
		margin-top: 11px;
	}
	summary {
		color: #276052;
		font-size: 0.66rem;
		font-weight: 750;
		cursor: pointer;
	}
	.items {
		margin-top: 9px;
		border-top: 1px solid #e1e7e9;
	}
	.item {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) auto minmax(100px, 0.5fr) auto 32px;
		gap: 12px;
		align-items: center;
		border-bottom: 1px solid #e1e7e9;
		padding: 10px 0;
	}
	.item > p {
		grid-column: 1 / -1;
		margin: 0;
		color: #6d7d83;
		font-size: 0.62rem;
	}
	.item > p.error {
		color: #9b4038;
	}
	.actions button {
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		border: 1px solid #d6dfe1;
		border-radius: 5px;
		color: #276052;
		background: white;
	}
	.attention {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 10px 0 0;
		color: #8c6425;
		font-size: 0.65rem;
	}
	@media (max-width: 720px) {
		.runs article > header {
			grid-template-columns: 1fr auto;
			gap: 10px;
		}
		.item {
			grid-template-columns: 1fr auto;
		}
		.actions {
			justify-self: end;
		}
	}
</style>
