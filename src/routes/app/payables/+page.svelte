<script lang="ts">
	import { Check, ExternalLink, Plus, ReceiptText, Send, Upload, X } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const payables = useQuery(api.payables.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const recipients = useQuery(api.recipients.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createPayable = useMutation(api.payables.create);
	const submitPayable = useMutation(api.payables.submitForApproval);
	const approvePayable = useMutation(api.payables.approve);
	const queuePayment = useMutation(api.payables.queuePayment);
	const generateUploadUrl = useMutation(api.payables.generateReceiptUploadUrl);
	let tab = $state<'bill' | 'expense'>('bill');
	let asset = $state<'ETH' | 'USDC'>('ETH');
	let creating = $state(false);
	let sourceWalletId = $state('');
	let reference = $state('');
	let payeeName = $state('');
	let recipientId = $state('');
	let destination = $state('');
	let amount = $state('');
	let category = $state('');
	let memo = $state('');
	let dueDate = $state(new Date().toISOString().slice(0, 10));
	let receiptFile = $state<File | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let selectedPayable = $state<NonNullable<typeof payables.data>[number] | null>(null);
	let filtered = $derived((payables.data ?? []).filter((row) => row.payable.type === tab));

	$effect(() => {
		if (!sourceWalletId)
			sourceWalletId = wallets.data?.find((wallet) => wallet.purpose !== 'collection')?._id ?? '';
	});

	function selectRecipient(id: string) {
		recipientId = id;
		const recipient = recipients.data?.find((item) => item._id === id);
		if (recipient) {
			destination = recipient.address;
			payeeName ||= recipient.label;
		}
	}

	async function save() {
		if (!workspace.activeOrganizationId) return;
		saving = true;
		error = null;
		try {
			let receiptStorageId: Id<'_storage'> | undefined;
			if (receiptFile) {
				const uploadUrl = await generateUploadUrl({
					organizationId: workspace.activeOrganizationId
				});
				const response = await fetch(uploadUrl, {
					method: 'POST',
					headers: { 'Content-Type': receiptFile.type || 'application/octet-stream' },
					body: receiptFile
				});
				if (!response.ok) throw new Error('Receipt upload failed.');
				receiptStorageId = ((await response.json()) as { storageId: Id<'_storage'> }).storageId;
			}
			await createPayable({
				organizationId: workspace.activeOrganizationId,
				type: tab,
				asset,
				reference,
				payeeName,
				recipientId: recipientId ? (recipientId as Id<'recipients'>) : undefined,
				destination,
				amount,
				dueAt: new Date(`${dueDate}T23:59:59`).getTime(),
				category: category || undefined,
				memo: memo || undefined,
				receiptStorageId
			});
			creating = false;
			reference = '';
			payeeName = '';
			recipientId = '';
			destination = '';
			amount = '';
			category = '';
			memo = '';
			receiptFile = null;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save payable.';
		} finally {
			saving = false;
		}
	}

	async function pay(row: NonNullable<typeof payables.data>[number]) {
		if (!workspace.activeOrganizationId || !sourceWalletId) return;
		if (
			!confirm(
				`Queue ${row.payable.amount} ${row.payable.asset} to ${row.payable.payeeName} at ${row.payable.destination}? Privy will enforce the final signing route.`
			)
		)
			return;
		try {
			await queuePayment({
				organizationId: workspace.activeOrganizationId,
				payableId: row.payable._id,
				walletId: sourceWalletId as Id<'wallets'>
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to queue payment.';
		}
	}

	async function submitForApproval(row: NonNullable<typeof payables.data>[number]) {
		if (!workspace.activeOrganizationId || !sourceWalletId) return;
		try {
			await submitPayable({
				organizationId: workspace.activeOrganizationId,
				payableId: row.payable._id,
				walletId: sourceWalletId as Id<'wallets'>
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to request payable approval.';
		}
	}

	async function approve(row: NonNullable<typeof payables.data>[number]) {
		if (!workspace.activeOrganizationId) return;
		try {
			await approvePayable({
				organizationId: workspace.activeOrganizationId,
				payableId: row.payable._id
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to approve payable.';
		}
	}
</script>

<svelte:head><title>Bills and expenses | Ratib</title></svelte:head>

<PageHeader
	eyebrow="ACCOUNTS PAYABLE"
	title="Bills & expenses"
	description="Capture obligations and receipts, then route exact ETH or USDC payments through the shared Privy operation engine."
>
	{#snippet action()}<button class="button primary" onclick={() => (creating = true)}
			><Plus size={15} /> New {tab}</button
		>{/snippet}
</PageHeader>

<div class="page-controls">
	<div class="segmented">
		<button class:active={tab === 'bill'} onclick={() => (tab = 'bill')}>Bills</button><button
			class:active={tab === 'expense'}
			onclick={() => (tab = 'expense')}>Expenses</button
		>
	</div>
	<label
		>Payment wallet<select bind:value={sourceWalletId}
			><option value="">Select treasury wallet</option
			>{#each (wallets.data ?? []).filter((wallet) => wallet.purpose !== 'collection') as wallet}<option
					value={wallet._id}>{wallet.name}</option
				>{/each}</select
		></label
	>
</div>

{#if error}<p class="form-error page-error" role="alert">{error}</p>{/if}
<section class="panel payable-panel">
	<header>
		<div>
			<h2>{tab === 'bill' ? 'Vendor bills' : 'Employee and business expenses'}</h2>
			<p>Amounts are stored as validated decimal strings.</p>
		</div>
		<span>{filtered.length} records</span>
	</header>
	{#if payables.isLoading}<div class="payable-empty">
			Loading payables…
		</div>{:else if payables.error}<div class="payable-empty error">
			{payables.error.message}
		</div>{:else if filtered.length === 0}<div class="payable-empty">
			<ReceiptText size={26} /><strong>No {tab === 'bill' ? 'bills' : 'expenses'} recorded</strong
			><span>Create a real obligation to begin its controlled payment lifecycle.</span>
		</div>{:else}<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Reference</th><th>Payee</th><th>Amount</th><th>Due</th><th>Evidence</th><th
							>Status</th
						><th></th></tr
					></thead
				><tbody
					>{#each filtered as row}<tr
							><td
								><strong>{row.payable.reference}</strong><small
									>{row.payable.category ?? row.payable.type}</small
								></td
							><td
								>{row.payable.payeeName}<small class="mono"
									>{row.payable.destination.slice(0, 9)}…{row.payable.destination.slice(-6)}</small
								></td
							><td><strong>{row.payable.amount} {row.payable.asset}</strong></td><td
								>{new Date(row.payable.dueAt).toLocaleDateString()}</td
							><td
								>{#if row.receiptUrl}<a href={row.receiptUrl} target="_blank" rel="noreferrer"
										>Open <ExternalLink size={12} /></a
									>{:else}None{/if}</td
							><td><StatusBadge status={row.payable.status} /></td><td
								><div class="row-actions">
									<button
										class="icon-button"
										title={`Open ${row.payable.type}`}
										aria-label={`Open payable ${row.payable.reference}`}
										onclick={() => (selectedPayable = row)}><ReceiptText size={14} /></button
									>{#if row.payable.status === 'draft'}<button
										class="button secondary compact-button"
										disabled={!sourceWalletId}
										onclick={() => submitForApproval(row)}>Submit <Send size={13} /></button
									>{:else if row.payable.status === 'pendingApproval'}<button
										class="button secondary compact-button"
										onclick={() => approve(row)}>Approve <Check size={13} /></button
									>{:else if row.payable.status === 'approved' || row.payable.status === 'failed'}<button
										class="button secondary compact-button"
										disabled={!sourceWalletId}
										onclick={() => pay(row)}
										>{row.payable.status === 'failed' ? 'Retry' : 'Pay'} <Send size={13} /></button
									>{:else if row.payable.operationId}<a class="text-link" href="/app/approvals"
										>Track</a
									>{/if}
								</div></td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</section>

{#if selectedPayable}<div class="modal-backdrop" role="presentation">
		<div class="payable-dialog detail-dialog" role="dialog" aria-modal="true" aria-labelledby="payable-detail-title">
			<button class="dialog-close" aria-label="Close payable" onclick={() => (selectedPayable = null)}><X size={17} /></button>
			<p class="eyebrow">{selectedPayable.payable.type.toUpperCase()} DETAILS</p>
			<h2 id="payable-detail-title">{selectedPayable.payable.reference}</h2>
			<div class="detail-summary">
				<div><span>Payee</span><strong>{selectedPayable.payable.payeeName}</strong></div>
				<div><span>Amount</span><strong>{selectedPayable.payable.amount} {selectedPayable.payable.asset}</strong></div>
				<div><span>Due date</span><strong>{new Date(selectedPayable.payable.dueAt).toLocaleDateString()}</strong></div>
				<div><span>Status</span><StatusBadge status={selectedPayable.payable.status} /></div>
				<div><span>Category</span><strong>{selectedPayable.payable.category ?? 'Uncategorized'}</strong></div>
				<div><span>Source treasury</span><strong>{wallets.data?.find((wallet) => wallet._id === selectedPayable?.payable.sourceWalletId)?.name ?? 'Chosen when submitted'}</strong></div>
			</div>
			<div class="detail-section">
				<span>Destination</span><code>{selectedPayable.payable.destination}</code>
			</div>
			{#if selectedPayable.payable.memo}<div class="detail-section"><span>Memo</span><p>{selectedPayable.payable.memo}</p></div>{/if}
			<div class="detail-section">
				<span>Evidence</span>
				{#if selectedPayable.receiptUrl}<a class="button secondary evidence-link" href={selectedPayable.receiptUrl} target="_blank" rel="noreferrer">Open receipt <ExternalLink size={13} /></a>{:else}<p>No receipt attached.</p>{/if}
			</div>
			<div class="dialog-actions"><button class="button secondary" onclick={() => (selectedPayable = null)}>Close</button></div>
		</div>
	</div>{/if}

{#if creating}<div class="modal-backdrop" role="presentation">
		<div class="payable-dialog" role="dialog" aria-modal="true" aria-labelledby="payable-title">
			<button class="dialog-close" aria-label="Close" onclick={() => (creating = false)}
				><X size={17} /></button
			>
			<p class="eyebrow">NEW {tab.toUpperCase()}</p>
			<h2 id="payable-title">Record {tab}</h2>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<label for="payable-asset">Asset</label><select id="payable-asset" bind:value={asset}
					><option value="ETH">ETH</option><option value="USDC">USDC</option></select
				>
				<div class="field-pair">
					<div>
						<label for="payable-reference">Reference</label><input
							id="payable-reference"
							bind:value={reference}
							maxlength="80"
							required
						/>
					</div>
					<div>
						<label for="payable-due">Due date</label><input
							id="payable-due"
							type="date"
							bind:value={dueDate}
							required
						/>
					</div>
				</div>
				<label for="payable-recipient">Approved counterparty <span>optional</span></label><select
					id="payable-recipient"
					value={recipientId}
					onchange={(event) => selectRecipient(event.currentTarget.value)}
					><option value="">Enter address manually</option
					>{#each (recipients.data ?? []).filter((item) => item.status !== 'revoked' && item.assets.includes(asset)) as recipient}<option
							value={recipient._id}
							>{recipient.label} · {recipient.status === 'approved'
								? 'approved'
								: 'pending approval'}</option
						>{/each}</select
				>
				<div class="field-pair">
					<div>
						<label for="payee-name">Payee name</label><input
							id="payee-name"
							bind:value={payeeName}
							maxlength="120"
							required
						/>
					</div>
					<div>
						<label for="payable-amount">Amount</label>
						<div class="amount-input">
							<input id="payable-amount" bind:value={amount} inputmode="decimal" required /><span
								>{asset}</span
							>
						</div>
					</div>
				</div>
				<label for="payable-destination">Destination address</label><input
					id="payable-destination"
					class="mono"
					bind:value={destination}
					placeholder="0x…"
					required
				/>
				<div class="field-pair">
					<div>
						<label for="category">Category <span>optional</span></label><input
							id="category"
							bind:value={category}
						/>
					</div>
					<div>
						<label for="receipt">Receipt or bill <span>optional</span></label><label
							class="file-input"
							for="receipt"><Upload size={14} /> {receiptFile?.name ?? 'Choose file'}</label
						><input
							id="receipt"
							class="hidden-file"
							type="file"
							accept="image/*,.pdf"
							onchange={(event) => (receiptFile = event.currentTarget.files?.[0] ?? null)}
						/>
					</div>
				</div>
				<label for="payable-memo">Memo <span>optional</span></label><textarea
					id="payable-memo"
					bind:value={memo}
					maxlength="140"
					rows="3"></textarea>{#if error}<p class="form-error" role="alert">{error}</p>{/if}
				<div class="dialog-actions">
					<button type="button" class="button secondary" onclick={() => (creating = false)}
						>Cancel</button
					><button type="submit" class="button primary" disabled={saving}
						>{saving ? 'Saving…' : `Save ${tab}`}</button
					>
				</div>
			</form>
		</div>
	</div>{/if}

<style>
	.page-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
	}
	.segmented {
		display: flex;
		border: 1px solid #d5dee1;
		padding: 3px;
		background: white;
	}
	.segmented button {
		border: 0;
		padding: 7px 15px;
		color: #68777d;
		background: transparent;
		font-size: 0.7rem;
		font-weight: 750;
	}
	.segmented button.active {
		color: #193f4d;
		background: #e7eff1;
	}
	.page-controls > label {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #66767d;
		font-size: 0.65rem;
		font-weight: 700;
	}
	.page-controls select {
		border: 1px solid #d5dee1;
		padding: 7px 9px;
		background: white;
		font-size: 0.68rem;
	}
	.page-error {
		margin-bottom: 12px;
	}
	.payable-panel header > span {
		color: #75838a;
		font-size: 0.68rem;
	}
	.payable-panel td small {
		display: block;
		margin-top: 3px;
		color: #7c898f;
		font-size: 0.58rem;
	}
	.payable-panel td a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #286352;
		font-size: 0.65rem;
		font-weight: 750;
	}
	.compact-button {
		height: 31px;
		padding: 0 10px;
		font-size: 0.64rem;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.payable-empty {
		display: grid;
		min-height: 260px;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: #738188;
		font-size: 0.72rem;
		text-align: center;
	}
	.payable-empty :global(svg) {
		color: #387563;
	}
	.payable-empty strong {
		color: #2b3e45;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.payable-empty.error {
		color: #9c4038;
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
	.payable-dialog {
		position: relative;
		width: min(680px, 100%);
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
	.payable-dialog h2 {
		margin: 10px 0;
		font-family: Georgia, serif;
		font-size: 1.6rem;
		font-weight: 500;
	}
	.detail-dialog {
		width: min(650px, 100%);
	}
	.detail-summary {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin-top: 18px;
		border: 1px solid #dce4e6;
		background: #dce4e6;
	}
	.detail-summary > div {
		display: grid;
		gap: 5px;
		padding: 13px;
		background: white;
	}
	.detail-summary span,
	.detail-section > span {
		color: #75838a;
		font-size: 0.6rem;
		font-weight: 750;
		text-transform: uppercase;
	}
	.detail-summary strong {
		font-size: 0.74rem;
	}
	.detail-section {
		display: grid;
		gap: 7px;
		margin-top: 17px;
	}
	.detail-section code {
		border: 1px solid #dce4e6;
		padding: 11px;
		overflow-wrap: anywhere;
		font-size: 0.68rem;
	}
	.detail-section p {
		margin: 0;
		color: #6e7c83;
		font-size: 0.7rem;
	}
	.evidence-link {
		width: fit-content;
	}
	.payable-dialog form {
		display: grid;
	}
	.payable-dialog label {
		margin: 11px 0 6px;
		color: #354950;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.payable-dialog label span {
		color: #879399;
		font-weight: 500;
	}
	.payable-dialog input,
	.payable-dialog select,
	.payable-dialog textarea {
		width: 100%;
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 10px;
		font: inherit;
		font-size: 0.74rem;
	}
	.payable-dialog textarea {
		resize: vertical;
	}
	.amount-input {
		position: relative;
	}
	.amount-input input {
		padding-right: 48px;
	}
	.amount-input span {
		position: absolute;
		top: 50%;
		right: 10px;
		transform: translateY(-50%);
		color: #7a888e;
		font-size: 0.57rem;
	}
	.file-input {
		display: flex;
		height: 38px;
		align-items: center;
		gap: 7px;
		margin: 0 !important;
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 0 10px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hidden-file {
		position: absolute;
		width: 1px !important;
		height: 1px;
		opacity: 0;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 20px;
	}
	@media (max-width: 620px) {
		.page-controls {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
		.payable-dialog {
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
		.detail-summary {
			grid-template-columns: 1fr;
		}
	}
</style>
