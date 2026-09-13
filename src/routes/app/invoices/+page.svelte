<script lang="ts">
	import { Copy, ExternalLink, FileText, Plus, RefreshCw, Send, X } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { assetDecimals, decimalToUnits, unitsToDecimal } from '$lib/domain';
	import { workspace } from '$lib/workspace.svelte';

	const invoices = useQuery(api.invoices.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const readiness = useQuery(api.invoices.readiness, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createInvoice = useMutation(api.invoices.createAndIssue);
	const prepareInfrastructure = useMutation(api.invoices.prepareInfrastructure);
	const rotateLink = useMutation(api.invoices.rotatePublicLink);
	const voidInvoice = useMutation(api.invoices.voidInvoice);
	let creating = $state(false);
	let asset = $state<'ETH' | 'USDC'>('ETH');
	let invoiceNumber = $state('');
	let customerName = $state('');
	let customerEmail = $state('');
	let dueDate = $state(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
	let treasuryWalletId = $state('');
	let notes = $state('');
	let lineItems = $state([{ description: '', quantity: '1', unitAmount: '' }]);
	let working = $state(false);
	let error = $state<string | null>(null);
	let issuedLink = $state<string | null>(null);
	let issuedLinkInvoiceId = $state<string | null>(null);
	let preparing = $state(false);
	let selectedInvoice = $state<NonNullable<typeof invoices.data>[number] | null>(null);

	$effect(() => {
		if (!treasuryWalletId)
			treasuryWalletId = wallets.data?.find((wallet) => wallet.purpose !== 'collection')?._id ?? '';
	});

	let total = $derived.by(() => {
		try {
			const units = lineItems.reduce(
				(sum, item) =>
					sum +
					BigInt(item.quantity || '0') *
						decimalToUnits(item.unitAmount || '0', assetDecimals(asset)),
				0n
			);
			return unitsToDecimal(units.toString(), assetDecimals(asset));
		} catch {
			return '0';
		}
	});

	function updateLine(
		index: number,
		field: 'description' | 'quantity' | 'unitAmount',
		value: string
	) {
		lineItems = lineItems.map((item, itemIndex) =>
			itemIndex === index ? { ...item, [field]: value } : item
		);
	}

	async function issue() {
		if (!workspace.activeOrganizationId || !treasuryWalletId) return;
		if (
			!confirm(
				`Issue invoice ${invoiceNumber} for ${total} ${asset}? Ratib will provision a dedicated live Privy collection wallet and a policy-bound sweep.`
			)
		)
			return;
		working = true;
		error = null;
		try {
			const result = await createInvoice({
				organizationId: workspace.activeOrganizationId,
				asset,
				invoiceNumber,
				customerName,
				customerEmail: customerEmail || undefined,
				dueAt: new Date(`${dueDate}T23:59:59`).getTime(),
				lineItems,
				notes: notes || undefined,
				treasuryWalletId: treasuryWalletId as NonNullable<typeof wallets.data>[number]['_id']
			});
			issuedLink = `${location.origin}/pay/${result.publicToken}`;
			issuedLinkInvoiceId = result.invoiceId;
			creating = false;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to issue invoice.';
		} finally {
			working = false;
		}
	}

	async function prepare() {
		if (!workspace.activeOrganizationId) return;
		preparing = true;
		error = null;
		try {
			await prepareInfrastructure({ organizationId: workspace.activeOrganizationId });
		} catch (caught) {
			error =
				caught instanceof Error ? caught.message : 'Unable to prepare invoice infrastructure.';
		} finally {
			preparing = false;
		}
	}

	async function rotate(invoiceId: NonNullable<typeof invoices.data>[number]['invoice']['_id']) {
		if (
			!workspace.activeOrganizationId ||
			!confirm('Rotate this public payment link? The previous link will stop working immediately.')
		)
			return;
		const result = await rotateLink({ organizationId: workspace.activeOrganizationId, invoiceId });
		issuedLink = `${location.origin}/pay/${result.publicToken}`;
		issuedLinkInvoiceId = invoiceId;
	}

	async function voidRecord(
		invoiceId: NonNullable<typeof invoices.data>[number]['invoice']['_id']
	) {
		if (
			!workspace.activeOrganizationId ||
			!confirm(
				'Void this invoice? Its collection wallet remains governed, but the invoice will no longer be payable.'
			)
		)
			return;
		await voidInvoice({ organizationId: workspace.activeOrganizationId, invoiceId });
	}

	async function copy(value: string) {
		await navigator.clipboard.writeText(value);
	}
</script>

<svelte:head><title>Invoices | Ratib</title></svelte:head>

<PageHeader
	eyebrow="ACCOUNTS RECEIVABLE"
	title="Invoices"
	description="Issue ETH or USDC payment requests with one policy-bound Privy collection wallet per invoice."
>
	{#snippet action()}<button
			class="button primary"
			onclick={() => {
				creating = true;
				issuedLink = null;
			}}><Plus size={15} /> New invoice</button
		>{/snippet}
</PageHeader>

{#if readiness.data && !readiness.data.ready}
	<div class="link-banner" role="status">
		<div>
			<strong>Invoice infrastructure needs preparation</strong><span>{readiness.data.message}</span>
		</div>
		<button class="button secondary" disabled={preparing} onclick={prepare}
			>{preparing ? 'Preparing…' : 'Prepare in Ratib'}</button
		>
	</div>
{/if}

{#if issuedLink}<div class="link-banner" role="status">
		<div><strong>Secure payment link ready</strong><span>{issuedLink}</span></div>
		<button class="button secondary" onclick={() => copy(issuedLink!)}
			><Copy size={14} /> Copy link</button
		><a
			class="icon-button"
			href={issuedLink}
			target="_blank"
			rel="noreferrer"
			aria-label="Open payment link"><ExternalLink size={15} /></a
		>
	</div>{/if}

<section class="panel invoice-panel">
	<header>
		<div>
			<h2>Receivables</h2>
			<p>Provisioning, deposits, payment status, and collection addresses.</p>
		</div>
		<span>{invoices.data?.length ?? 0} invoices</span>
	</header>
	{#if invoices.isLoading}<div class="invoice-empty">Loading organization invoices…</div>
	{:else if invoices.error}<div class="invoice-empty error" role="alert">
			{invoices.error.message}
		</div>
	{:else if invoices.data?.length === 0}<div class="invoice-empty">
			<FileText size={27} /><strong>No invoices issued</strong><span
				>Your first real collection workflow will appear here.</span
			>
		</div>
	{:else}<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Invoice</th><th>Customer</th><th>Due</th><th>Collected</th><th
							>Collection wallet</th
						><th>Status</th><th></th></tr
					></thead
				><tbody
					>{#each invoices.data ?? [] as row}<tr
							><td
								><strong>{row.invoice.invoiceNumber}</strong><small
									>{row.invoice.amount} {row.invoice.asset}</small
								></td
							><td>{row.invoice.customerName}</td><td
								>{new Date(row.invoice.dueAt).toLocaleDateString()}</td
							><td><strong>{row.invoice.paidAmount} {row.invoice.asset}</strong></td><td
								class="mono small"
								>{row.collectionAddress
									? `${row.collectionAddress.slice(0, 9)}…${row.collectionAddress.slice(-6)}`
									: row.invoice.status === 'failed'
										? 'Provisioning failed'
										: 'Provisioning…'}</td
							><td><StatusBadge status={row.invoice.status} /></td><td
								><div class="row-actions">
									<button
										class="icon-button"
										title="Open invoice"
										aria-label={`Open invoice ${row.invoice.invoiceNumber}`}
										onclick={() => (selectedInvoice = row)}><FileText size={14} /></button
									>
									<button
										class="icon-button"
										title="Rotate public link"
										aria-label={`Rotate link for ${row.invoice.invoiceNumber}`}
										disabled={row.invoice.status === 'void'}
										onclick={() => rotate(row.invoice._id)}><RefreshCw size={14} /></button
									><button
										class="icon-button danger"
										title="Void invoice"
										aria-label={`Void ${row.invoice.invoiceNumber}`}
										disabled={row.invoice.status === 'paid' || row.invoice.status === 'void'}
										onclick={() => voidRecord(row.invoice._id)}><X size={15} /></button
									>
								</div></td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</section>

{#if selectedInvoice}
	<div class="modal-backdrop" role="presentation">
		<div
			class="invoice-dialog detail-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="invoice-detail-title"
		>
			<button
				class="dialog-close"
				aria-label="Close invoice"
				onclick={() => (selectedInvoice = null)}><X size={17} /></button
			>
			<p class="eyebrow">INVOICE DETAILS</p>
			<h2 id="invoice-detail-title">{selectedInvoice.invoice.invoiceNumber}</h2>
			<div class="detail-summary">
				<div><span>Customer</span><strong>{selectedInvoice.invoice.customerName}</strong></div>
				<div
					><span>Amount due</span><strong
						>{selectedInvoice.invoice.amount} {selectedInvoice.invoice.asset}</strong
					></div
				>
				<div
					><span>Collected</span><strong
						>{selectedInvoice.invoice.paidAmount} {selectedInvoice.invoice.asset}</strong
					></div
				>
				<div
					><span>Due date</span><strong
						>{new Date(selectedInvoice.invoice.dueAt).toLocaleDateString()}</strong
					></div
				>
			</div>
			<div class="detail-section">
				<div class="detail-heading">
					<span>Line items</span><StatusBadge status={selectedInvoice.invoice.status} />
				</div>
				{#each selectedInvoice.invoice.lineItems as item}
					<div class="detail-line">
						<div
							><strong>{item.description}</strong><span
								>{item.quantity} × {item.unitAmount} {selectedInvoice.invoice.asset}</span
							></div
						>
						<strong
							>{unitsToDecimal(
								(
									BigInt(item.quantity) *
									decimalToUnits(item.unitAmount, assetDecimals(selectedInvoice.invoice.asset))
								).toString(),
								assetDecimals(selectedInvoice.invoice.asset)
							)} {selectedInvoice.invoice.asset}</strong
						>
					</div>
				{/each}
			</div>
			<div class="detail-section">
				<span>Collection wallet</span>
				<div class="wallet-address">
					<code>{selectedInvoice.collectionAddress ?? 'Provisioning…'}</code>
					{#if selectedInvoice.collectionAddress}<button
							class="icon-button"
							title="Copy collection address"
							aria-label="Copy collection address"
							onclick={() => copy(selectedInvoice!.collectionAddress!)}><Copy size={14} /></button
						>{/if}
				</div>
			</div>
			<div class="detail-section">
				<span>Payment URL</span>
				{#if issuedLink && issuedLinkInvoiceId === selectedInvoice.invoice._id}
					<div class="payment-url">
						<code>{issuedLink}</code>
						<button class="icon-button" title="Copy payment URL" aria-label="Copy payment URL" onclick={() => copy(issuedLink!)}><Copy size={14} /></button>
						<a class="icon-button" href={issuedLink} target="_blank" rel="noreferrer" title="Open payment URL" aria-label="Open payment URL"><ExternalLink size={14} /></a>
					</div>
				{:else}
					<button class="button secondary fresh-link" onclick={() => rotate(selectedInvoice!.invoice._id)}><ExternalLink size={14} /> Generate payment URL</button>
				{/if}
			</div>
			{#if selectedInvoice.invoice.notes}<div class="detail-section">
					<span>Notes</span><p>{selectedInvoice.invoice.notes}</p>
				</div>{/if}
			<div class="dialog-actions">
				<button class="button secondary" onclick={() => (selectedInvoice = null)}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if creating}
	<div class="modal-backdrop" role="presentation">
		<div class="invoice-dialog" role="dialog" aria-modal="true" aria-labelledby="new-invoice-title">
			<button class="dialog-close" aria-label="Close" onclick={() => (creating = false)}
				><X size={17} /></button
			>
			<p class="eyebrow">NEW RECEIVABLE</p>
			<h2 id="new-invoice-title">Issue {asset} invoice</h2>
			<p>A dedicated Base Sepolia wallet is created only after final confirmation.</p>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void issue();
				}}
			>
				<label for="invoice-asset">Asset</label><select id="invoice-asset" bind:value={asset}
					><option value="ETH">ETH</option><option value="USDC">USDC</option></select
				>
				<div class="field-pair">
					<div>
						<label for="invoice-number">Invoice number</label><input
							id="invoice-number"
							bind:value={invoiceNumber}
							maxlength="50"
							required
						/>
					</div>
					<div>
						<label for="due-date">Due date</label><input
							id="due-date"
							type="date"
							bind:value={dueDate}
							required
						/>
					</div>
				</div>
				<div class="field-pair">
					<div>
						<label for="customer-name">Customer</label><input
							id="customer-name"
							bind:value={customerName}
							maxlength="120"
							required
						/>
					</div>
					<div>
						<label for="customer-email">Customer email <span>optional</span></label><input
							id="customer-email"
							type="email"
							bind:value={customerEmail}
						/>
					</div>
				</div>
				<label for="treasury-wallet">Settlement treasury</label><select
					id="treasury-wallet"
					bind:value={treasuryWalletId}
					required
					><option value="" disabled>Select treasury wallet</option
					>{#each (wallets.data ?? []).filter((wallet) => wallet.purpose !== 'collection') as wallet}<option
							value={wallet._id}>{wallet.name} · {wallet.address.slice(0, 9)}…</option
						>{/each}</select
				>
				<div class="line-heading">
					<div class="field-label">Line items</div>
					<button
						type="button"
						onclick={() =>
							(lineItems = [...lineItems, { description: '', quantity: '1', unitAmount: '' }])}
						><Plus size={14} /> Add line</button
					>
				</div>
				<div class="line-items">
					{#each lineItems as item, index}<div>
							<input
								aria-label={`Line ${index + 1} description`}
								value={item.description}
								oninput={(event) => updateLine(index, 'description', event.currentTarget.value)}
								placeholder="Description"
								required
							/><input
								aria-label={`Line ${index + 1} quantity`}
								value={item.quantity}
								oninput={(event) => updateLine(index, 'quantity', event.currentTarget.value)}
								inputmode="numeric"
								placeholder="Qty"
								required
							/>
							<div class="amount-input">
								<input
									aria-label={`Line ${index + 1} unit amount`}
									value={item.unitAmount}
									oninput={(event) => updateLine(index, 'unitAmount', event.currentTarget.value)}
									inputmode="decimal"
									placeholder="0.00"
									required
								/><span>{asset}</span>
							</div>
							{#if lineItems.length > 1}<button
									type="button"
									aria-label={`Remove line ${index + 1}`}
									onclick={() =>
										(lineItems = lineItems.filter((_, itemIndex) => itemIndex !== index))}
									><X size={14} /></button
								>{/if}
						</div>{/each}
				</div>
				<div class="invoice-total"><span>Total due</span><strong>{total} {asset}</strong></div>
				<label for="invoice-notes">Payment notes <span>optional</span></label><textarea
					id="invoice-notes"
					bind:value={notes}
					rows="3"
					maxlength="500"></textarea>{#if error}<p class="form-error" role="alert">{error}</p>{/if}
				<div class="dialog-actions">
					<button type="button" class="button secondary" onclick={() => (creating = false)}
						>Cancel</button
					><button
						type="submit"
						class="button primary"
						disabled={working || total === '0' || !treasuryWalletId}
						>{working ? 'Provisioning…' : 'Issue and create wallet'} <Send size={14} /></button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.link-banner {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 14px;
		border: 1px solid #bcd8cf;
		padding: 13px 15px;
		background: #edf8f4;
	}
	.link-banner div {
		min-width: 0;
		flex: 1;
	}
	.link-banner strong,
	.link-banner span {
		display: block;
	}
	.link-banner strong {
		font-size: 0.74rem;
	}
	.link-banner span {
		margin-top: 3px;
		overflow: hidden;
		color: #557068;
		font: 0.62rem var(--font-mono);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.invoice-panel header > span {
		color: #75838a;
		font-size: 0.68rem;
	}
	.invoice-panel td small {
		display: block;
		margin-top: 3px;
		color: #7d8a90;
		font-size: 0.6rem;
	}
	.invoice-empty {
		display: grid;
		min-height: 270px;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: #738188;
		font-size: 0.72rem;
		text-align: center;
	}
	.invoice-empty :global(svg) {
		color: #397563;
	}
	.invoice-empty strong {
		color: #2c3e45;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.invoice-empty.error {
		color: #9d4139;
	}
	.row-actions {
		display: flex;
		gap: 4px;
	}
	.icon-button.danger {
		color: #9d4841;
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
	.invoice-dialog {
		position: relative;
		width: min(760px, 100%);
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
	.invoice-dialog h2 {
		margin: 10px 0 7px;
		font-family: Georgia, serif;
		font-size: 1.65rem;
		font-weight: 500;
	}
	.invoice-dialog > p:not(.eyebrow) {
		color: #6e7c83;
		font-size: 0.72rem;
	}
	.invoice-dialog form {
		display: grid;
		margin-top: 16px;
	}
	.invoice-dialog label {
		margin: 12px 0 6px;
		color: #354951;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.invoice-dialog label span {
		color: #879399;
		font-weight: 500;
	}
	.invoice-dialog input,
	.invoice-dialog select,
	.invoice-dialog textarea {
		width: 100%;
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 10px;
		font: inherit;
		font-size: 0.74rem;
	}
	.invoice-dialog textarea {
		resize: vertical;
	}
	.line-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16px;
	}
	.line-heading .field-label {
		margin: 0;
	}
	.line-heading button {
		display: flex;
		align-items: center;
		gap: 5px;
		border: 0;
		color: #245c50;
		background: transparent;
		font-size: 0.65rem;
		font-weight: 750;
	}
	.line-items {
		display: grid;
		gap: 6px;
		margin-top: 7px;
	}
	.line-items > div {
		display: grid;
		grid-template-columns: 1fr 70px 160px 30px;
		gap: 6px;
	}
	.line-items > div > button {
		border: 0;
		color: #92504a;
		background: transparent;
	}
	.amount-input {
		position: relative;
	}
	.amount-input input {
		padding-right: 47px;
	}
	.amount-input span {
		position: absolute;
		top: 50%;
		right: 9px;
		transform: translateY(-50%);
		color: #7b888e;
		font-size: 0.57rem;
	}
	.invoice-total {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 12px;
		border-top: 1px solid #dce4e6;
		padding-top: 13px;
		font-size: 0.73rem;
	}
	.invoice-total strong {
		font-family: Georgia, serif;
		font-size: 1.1rem;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 20px;
	}
	.detail-dialog {
		width: min(680px, 100%);
	}
	.detail-summary {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		margin-top: 20px;
		border: 1px solid #dce4e6;
		background: #dce4e6;
	}
	.detail-summary > div {
		display: grid;
		gap: 4px;
		padding: 14px;
		background: #fff;
	}
	.detail-summary span,
	.detail-section > span {
		color: #75838a;
		font-size: 0.62rem;
		font-weight: 750;
		text-transform: uppercase;
	}
	.detail-summary strong {
		font-size: 0.76rem;
	}
	.detail-section {
		margin-top: 18px;
	}
	.detail-heading,
	.detail-line,
	.wallet-address,
	.payment-url {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.detail-heading {
		margin-bottom: 6px;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.detail-line {
		border-top: 1px solid #e2e8e9;
		padding: 12px 0;
		font-size: 0.72rem;
	}
	.detail-line div {
		display: grid;
		gap: 3px;
	}
	.detail-line span,
	.detail-section p {
		color: #6e7c83;
		font-size: 0.66rem;
	}
	.wallet-address,
	.payment-url {
		margin-top: 7px;
		border: 1px solid #dce4e6;
		padding: 10px 11px;
	}
	.wallet-address code,
	.payment-url code {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 0.68rem;
	}
	.payment-url code {
		flex: 1;
	}
	.fresh-link {
		margin-top: 7px;
	}
	@media (max-width: 620px) {
		.invoice-dialog {
			padding: 23px 16px;
		}
		.field-pair {
			grid-template-columns: 1fr;
		}
		.line-items > div {
			grid-template-columns: 1fr 55px;
		}
		.line-items .amount-input {
			grid-column: 1 / 2;
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
