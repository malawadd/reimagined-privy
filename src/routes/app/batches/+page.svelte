<script lang="ts">
	import { Layers3, Plus, Send, Users, X } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { decimalToUnits, unitsToDecimal } from '$lib/domain';
	import { workspace } from '$lib/workspace.svelte';

	const batches = useQuery(api.batches.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const recipients = useQuery(api.recipients.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createBatch = useMutation(api.batches.createAndQueue);
	let tab = $state<'batch' | 'payroll'>('batch');
	let creating = $state(false);
	let name = $state('');
	let sourceWalletId = $state('');
	let items = $state([{ label: '', recipientId: '', amount: '', memo: '' }]);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let filtered = $derived((batches.data ?? []).filter((row) => row.batch.type === tab));
	let total = $derived.by(() => {
		try {
			return unitsToDecimal(
				items.reduce((sum, item) => sum + decimalToUnits(item.amount || '0', 6), 0n).toString(),
				6
			);
		} catch {
			return '0';
		}
	});
	$effect(() => {
		if (!sourceWalletId)
			sourceWalletId = wallets.data?.find((wallet) => wallet.purpose !== 'collection')?._id ?? '';
	});

	function updateItem(
		index: number,
		field: 'label' | 'recipientId' | 'amount' | 'memo',
		value: string
	) {
		items = items.map((item, itemIndex) =>
			itemIndex === index ? { ...item, [field]: value } : item
		);
		if (field === 'recipientId') {
			const recipient = recipients.data?.find((entry) => entry._id === value);
			if (recipient && !items[index].label)
				items = items.map((item, itemIndex) =>
					itemIndex === index ? { ...item, label: recipient.label } : item
				);
		}
	}

	async function submit() {
		if (!workspace.activeOrganizationId || !sourceWalletId) return;
		if (
			!confirm(
				`Queue ${items.length} ${tab === 'payroll' ? 'payroll' : 'batch'} payment(s) totaling ${total} USDC? Each transfer will be independently evaluated by Privy.`
			)
		)
			return;
		submitting = true;
		error = null;
		try {
			await createBatch({
				organizationId: workspace.activeOrganizationId,
				type: tab,
				name,
				sourceWalletId: sourceWalletId as Id<'wallets'>,
				items: items.map((item) => ({
					label: item.label,
					recipientId: item.recipientId as Id<'recipients'>,
					amount: item.amount,
					memo: item.memo || undefined
				}))
			});
			creating = false;
			name = '';
			items = [{ label: '', recipientId: '', amount: '', memo: '' }];
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to queue batch.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Batches and payroll | Ratib</title></svelte:head>
<PageHeader
	eyebrow="BULK PAYMENTS"
	title="Batches & payroll"
	description="Queue independently traceable USDC transfers with one confirmation and per-item Privy enforcement."
>
	{#snippet action()}<button class="button primary" onclick={() => (creating = true)}
			><Plus size={15} /> New {tab}</button
		>{/snippet}
</PageHeader>

<div class="segmented">
	<button class:active={tab === 'batch'} onclick={() => (tab = 'batch')}
		><Layers3 size={14} /> Payment batches</button
	><button class:active={tab === 'payroll'} onclick={() => (tab = 'payroll')}
		><Users size={14} /> Payroll</button
	>
</div>
{#if error}<p class="form-error page-error" role="alert">{error}</p>{/if}
<section class="panel batch-panel">
	<header>
		<div>
			<h2>{tab === 'batch' ? 'Payment batches' : 'Payroll runs'}</h2>
			<p>Every item receives a deterministic request key and operation ID.</p>
		</div>
		<span>{filtered.length} runs</span>
	</header>
	{#if batches.isLoading}<div class="batch-empty">
			Loading bulk operations…
		</div>{:else if batches.error}<div class="batch-empty error">
			{batches.error.message}
		</div>{:else if filtered.length === 0}<div class="batch-empty">
			<Layers3 size={27} /><strong>No {tab === 'batch' ? 'batches' : 'payroll runs'} queued</strong
			><span>Create a run from approved USDC counterparties.</span>
		</div>{:else}<div class="batch-list">
			{#each filtered as row}<article>
					<div>
						<strong>{row.batch.name}</strong><small
							>{new Date(row.batch.createdAt).toLocaleString()} · {row.batch._id}</small
						>
					</div>
					<div><span>ITEMS</span><strong>{row.batch.itemCount}</strong></div>
					<div><span>TOTAL</span><strong>{row.batch.totalAmount} USDC</strong></div>
					<StatusBadge status={row.batch.status} />
					<details>
						<summary>View payments</summary>
						<div>
							{#each row.items as item}<p>
									<span>{item.label}</span><code>{item.amount} USDC · {item.destination}</code
									><StatusBadge status={item.status} />
								</p>{/each}
						</div>
					</details>
				</article>{/each}
		</div>{/if}
</section>

{#if creating}<div class="modal-backdrop" role="presentation">
		<div class="batch-dialog" role="dialog" aria-modal="true" aria-labelledby="batch-title">
			<button class="dialog-close" aria-label="Close" onclick={() => (creating = false)}
				><X size={17} /></button
			>
			<p class="eyebrow">NEW {tab.toUpperCase()}</p>
			<h2 id="batch-title">Queue {tab === 'batch' ? 'payment batch' : 'payroll run'}</h2>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<div class="field-pair">
					<div>
						<label for="batch-name">Run name</label><input
							id="batch-name"
							bind:value={name}
							maxlength="100"
							required
						/>
					</div>
					<div>
						<label for="batch-wallet">Source wallet</label><select
							id="batch-wallet"
							bind:value={sourceWalletId}
							required
							><option value="">Select wallet</option
							>{#each (wallets.data ?? []).filter((wallet) => wallet.purpose !== 'collection') as wallet}<option
									value={wallet._id}>{wallet.name}</option
								>{/each}</select
						>
					</div>
				</div>
				<div class="item-heading">
					<span>Payments</span><button
						type="button"
						onclick={() =>
							(items = [...items, { label: '', recipientId: '', amount: '', memo: '' }])}
						><Plus size={14} /> Add payment</button
					>
				</div>
				<div class="batch-items">
					{#each items as item, index}<div>
							<select
								aria-label={`Payment ${index + 1} recipient`}
								value={item.recipientId}
								onchange={(event) => updateItem(index, 'recipientId', event.currentTarget.value)}
								required
								><option value="">Approved recipient</option
								>{#each (recipients.data ?? []).filter((entry) => entry.status === 'approved' && entry.assets.includes('USDC')) as recipient}<option
										value={recipient._id}>{recipient.label}</option
									>{/each}</select
							><input
								aria-label={`Payment ${index + 1} label`}
								value={item.label}
								oninput={(event) => updateItem(index, 'label', event.currentTarget.value)}
								placeholder={tab === 'payroll' ? 'Employee or payroll reference' : 'Payment label'}
								required
							/>
							<div class="amount-input">
								<input
									aria-label={`Payment ${index + 1} amount`}
									value={item.amount}
									oninput={(event) => updateItem(index, 'amount', event.currentTarget.value)}
									inputmode="decimal"
									placeholder="0.00"
									required
								/><span>USDC</span>
							</div>
							{#if items.length > 1}<button
									type="button"
									aria-label={`Remove payment ${index + 1}`}
									onclick={() => (items = items.filter((_, itemIndex) => itemIndex !== index))}
									><X size={14} /></button
								>{/if}
						</div>{/each}
				</div>
				<div class="batch-total">
					<span>{items.length} payment(s)</span><strong>{total} USDC</strong>
				</div>
				{#if error}<p class="form-error" role="alert">{error}</p>{/if}
				<div class="dialog-actions">
					<button type="button" class="button secondary" onclick={() => (creating = false)}
						>Cancel</button
					><button
						type="submit"
						class="button primary"
						disabled={submitting || total === '0' || items.some((item) => !item.recipientId)}
						>{submitting ? 'Queueing…' : 'Confirm and queue'} <Send size={14} /></button
					>
				</div>
			</form>
		</div>
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
		display: flex;
		align-items: center;
		gap: 6px;
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
	.page-error {
		margin-bottom: 12px;
	}
	.batch-panel header > span {
		color: #75838a;
		font-size: 0.68rem;
	}
	.batch-empty {
		display: grid;
		min-height: 260px;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: #738188;
		font-size: 0.72rem;
		text-align: center;
	}
	.batch-empty :global(svg) {
		color: #397563;
	}
	.batch-empty strong {
		color: #2d3f46;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.batch-empty.error {
		color: #9c4038;
	}
	.batch-list article {
		display: grid;
		grid-template-columns: 1.4fr 0.45fr 0.7fr auto;
		gap: 18px;
		align-items: center;
		border-bottom: 1px solid #e0e6e8;
		padding: 16px 18px;
	}
	.batch-list article > div strong,
	.batch-list article > div small {
		display: block;
	}
	.batch-list small {
		margin-top: 4px;
		color: #7a888e;
		font-size: 0.57rem;
	}
	.batch-list article > div > span {
		color: #849197;
		font-size: 0.54rem;
		font-weight: 800;
		letter-spacing: 0.08em;
	}
	.batch-list details {
		grid-column: 1/-1;
	}
	.batch-list summary {
		color: #276052;
		font-size: 0.65rem;
		font-weight: 750;
		cursor: pointer;
	}
	.batch-list details div {
		margin-top: 9px;
		border-top: 1px solid #e2e7e9;
	}
	.batch-list details p {
		display: grid;
		grid-template-columns: 1fr 2fr auto;
		gap: 12px;
		align-items: center;
		border-bottom: 1px solid #e2e7e9;
		padding: 9px 0;
		font-size: 0.66rem;
	}
	.batch-list code {
		overflow: hidden;
		color: #6d7c82;
		font-size: 0.58rem;
		text-overflow: ellipsis;
	}
	.modal-backdrop {
		position: fixed;
		z-index: 100;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(8, 27, 35, 0.68);
	}
	.batch-dialog {
		position: relative;
		width: min(800px, 100%);
		max-height: calc(100vh - 35px);
		overflow: auto;
		border-radius: 7px;
		padding: 28px;
		background: white;
	}
	.dialog-close {
		position: absolute;
		top: 18px;
		right: 18px;
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid #dae2e4;
		border-radius: 5px;
		background: white;
	}
	.batch-dialog h2 {
		margin: 10px 0;
		font-family: Georgia, serif;
		font-size: 1.6rem;
		font-weight: 500;
	}
	.batch-dialog form {
		display: grid;
	}
	.batch-dialog label,
	.item-heading > span {
		margin: 11px 0 6px;
		color: #354950;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.batch-dialog input,
	.batch-dialog select {
		width: 100%;
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 10px;
		font: inherit;
		font-size: 0.72rem;
	}
	.item-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16px;
	}
	.item-heading button {
		display: flex;
		align-items: center;
		gap: 5px;
		border: 0;
		color: #276052;
		background: transparent;
		font-size: 0.65rem;
		font-weight: 750;
	}
	.batch-items {
		display: grid;
		gap: 6px;
	}
	.batch-items > div {
		display: grid;
		grid-template-columns: 1fr 1fr 155px 30px;
		gap: 6px;
	}
	.batch-items > div > button {
		border: 0;
		color: #984a43;
		background: transparent;
	}
	.amount-input {
		position: relative;
	}
	.amount-input input {
		padding-right: 45px;
	}
	.amount-input span {
		position: absolute;
		top: 50%;
		right: 8px;
		transform: translateY(-50%);
		color: #7a888e;
		font-size: 0.55rem;
	}
	.batch-total {
		display: flex;
		justify-content: flex-end;
		gap: 28px;
		margin-top: 14px;
		border-top: 1px solid #dce4e6;
		padding-top: 14px;
		font-size: 0.72rem;
	}
	.batch-total strong {
		font-family: Georgia, serif;
		font-size: 1.1rem;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 20px;
	}
	@media (max-width: 700px) {
		.batch-list article {
			grid-template-columns: 1fr 1fr;
		}
		.batch-items > div {
			grid-template-columns: 1fr 1fr;
		}
		.batch-items .amount-input {
			grid-column: 1/2;
		}
		.batch-dialog {
			padding: 23px 16px;
		}
		.field-pair {
			grid-template-columns: 1fr;
		}
		.dialog-actions {
			flex-direction: column-reverse;
		}
		.dialog-actions .button {
			width: 100%;
		}
	}
</style>
