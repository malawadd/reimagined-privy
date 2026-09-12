<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { Check, Copy, FileText, ShieldCheck, WalletCards } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { hashCapabilityToken } from '$lib/capability-token';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { decimalToUnits, unitsToDecimal } from '$lib/domain';

	let tokenHash = $state('');
	let linkError = $state(false);
	let copied = $state(false);
	const invoice = useQuery(api.invoices.getPublic, () => (tokenHash ? { tokenHash } : 'skip'));

	onMount(async () => {
		try {
			if (!page.params.token) throw new Error('Missing token.');
			tokenHash = await hashCapabilityToken(page.params.token);
		} catch {
			linkError = true;
		}
	});

	async function copyAddress() {
		if (!invoice.data?.collectionAddress) return;
		await navigator.clipboard.writeText(invoice.data.collectionAddress);
		copied = true;
		setTimeout(() => (copied = false), 1800);
	}

	function lineTotal(quantity: string, unitAmount: string) {
		try {
			return unitsToDecimal((BigInt(quantity) * decimalToUnits(unitAmount, 6)).toString(), 6);
		} catch {
			return '0';
		}
	}
</script>

<svelte:head
	><title>Pay invoice | Ratib</title><meta name="robots" content="noindex,nofollow" /></svelte:head
>

<header class="pay-header">
	<a href="/" class="pay-brand"><span>R</span><strong>RATIB</strong></a>
	<div><ShieldCheck size={15} /> Base Sepolia payment request</div>
</header>
<main class="pay-page">
	{#if linkError || invoice.data === null}
		<section class="pay-state">
			<FileText size={30} />
			<h1>Payment link unavailable</h1>
			<p>
				The link is invalid, expired through rotation, or no longer attached to an active Ratib
				organization.
			</p>
		</section>
	{:else if invoice.isLoading || !tokenHash}
		<section class="pay-state">
			<FileText size={30} />
			<h1>Loading invoice</h1>
			<p>Reading the current payment state from Ratib.</p>
		</section>
	{:else if invoice.error}
		<section class="pay-state">
			<ShieldCheck size={30} />
			<h1>Invoice unavailable</h1>
			<p>{invoice.error.message}</p>
		</section>
	{:else if invoice.data}
		<section class="invoice-sheet">
			<header>
				<div>
					<p class="eyebrow">PAYMENT REQUEST</p>
					<h1>Invoice {invoice.data.invoiceNumber}</h1>
					<span>Issued by {invoice.data.organizationName}</span>
				</div>
				<StatusBadge status={invoice.data.status} />
			</header>
			<div class="bill-to">
				<div><span>BILL TO</span><strong>{invoice.data.customerName}</strong></div>
				<div>
					<span>DUE DATE</span><strong>{new Date(invoice.data.dueAt).toLocaleDateString()}</strong>
				</div>
			</div>
			<div class="line-table">
				<header>
					<span>Description</span><span>Qty</span><span>Unit price</span><span>Total</span>
				</header>
				{#each invoice.data.lineItems as item}<div>
						<strong>{item.description}</strong><span>{item.quantity}</span><span
							>{item.unitAmount} USDC</span
						><span>{lineTotal(item.quantity, item.unitAmount)} USDC</span>
					</div>{/each}
			</div>
			<div class="amount-summary">
				<div><span>Received</span><strong>{invoice.data.paidAmount} USDC</strong></div>
				<div><span>Total due</span><strong>{invoice.data.amount} USDC</strong></div>
			</div>
			{#if invoice.data.status === 'paid'}
				<div class="paid-state">
					<Check size={20} />
					<div>
						<strong>Payment received</strong><span
							>Ratib reconciled this invoice from a signed Privy deposit event.</span
						>
					</div>
				</div>
			{:else if invoice.data.status === 'void'}
				<div class="closed-state">
					This invoice has been voided. Do not send funds to its collection address.
				</div>
			{:else if invoice.data.collectionAddress}
				<div class="payment-box">
					<div class="asset-mark"><WalletCards size={23} /></div>
					<div>
						<span>SEND ON BASE SEPOLIA</span><strong>{invoice.data.amount} USDC</strong><small
							>to this invoice-specific collection address</small
						>
					</div>
					<button onclick={copyAddress}
						>{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}
						{copied ? 'Copied' : 'Copy address'}</button
					><code>{invoice.data.collectionAddress}</code>
					<p>
						Only send Base Sepolia USDC. Funds sent on another network or using another asset may
						not be recoverable.
					</p>
				</div>
			{:else}<div class="closed-state">
					The collection wallet is still provisioning. Refresh after the issuer confirms the invoice
					is ready.
				</div>{/if}
			{#if invoice.data.notes}<div class="notes">
					<span>PAYMENT NOTES</span>
					<p>{invoice.data.notes}</p>
				</div>{/if}
		</section>
	{/if}
</main>
<footer class="pay-footer">Powered by Ratib · Wallet controls by Privy</footer>

<style>
	:global(body) {
		background: #edf2f2;
	}
	.pay-header {
		display: flex;
		height: 68px;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #d8e1e2;
		padding: 0 clamp(18px, 5vw, 70px);
		background: white;
	}
	.pay-brand {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.pay-brand span {
		display: grid;
		width: 30px;
		height: 30px;
		place-items: center;
		border-radius: 5px;
		color: white;
		background: #133d4d;
		font-family: Georgia, serif;
	}
	.pay-brand strong {
		font-size: 0.72rem;
		letter-spacing: 0.15em;
	}
	.pay-header > div {
		display: flex;
		align-items: center;
		gap: 7px;
		color: #49675f;
		font-size: 0.66rem;
		font-weight: 750;
	}
	.pay-page {
		min-height: calc(100vh - 125px);
		padding: 45px 18px;
	}
	.pay-state,
	.invoice-sheet {
		width: min(820px, 100%);
		margin: 0 auto;
		border: 1px solid #d7e0e2;
		background: white;
	}
	.pay-state {
		display: grid;
		min-height: 430px;
		place-items: center;
		align-content: center;
		gap: 10px;
		padding: 35px;
		text-align: center;
	}
	.pay-state :global(svg) {
		color: #397562;
	}
	.pay-state h1 {
		font-family: Georgia, serif;
		font-size: 1.8rem;
		font-weight: 500;
	}
	.pay-state p {
		max-width: 510px;
		color: #6e7d83;
		font-size: 0.78rem;
		line-height: 1.6;
	}
	.invoice-sheet {
		padding: clamp(24px, 5vw, 54px);
	}
	.invoice-sheet > header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		border-bottom: 2px solid #173e4c;
		padding-bottom: 25px;
	}
	.invoice-sheet h1 {
		margin: 9px 0 5px;
		font-family: Georgia, serif;
		font-size: clamp(2rem, 5vw, 3.2rem);
		font-weight: 500;
	}
	.invoice-sheet header span {
		color: #6d7c82;
		font-size: 0.75rem;
	}
	.bill-to {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 25px;
		padding: 26px 0;
	}
	.bill-to span,
	.notes > span {
		display: block;
		color: #7b898e;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.1em;
	}
	.bill-to strong {
		display: block;
		margin-top: 6px;
		font-size: 0.78rem;
	}
	.line-table {
		border-top: 1px solid #dce4e6;
	}
	.line-table header,
	.line-table > div {
		display: grid;
		grid-template-columns: 1fr 65px 130px 120px;
		gap: 10px;
		border-bottom: 1px solid #e0e6e8;
		padding: 11px 4px;
		font-size: 0.7rem;
	}
	.line-table header {
		color: #78868c;
		font-size: 0.58rem;
		font-weight: 800;
	}
	.line-table span:last-child {
		text-align: right;
	}
	.amount-summary {
		display: flex;
		justify-content: flex-end;
		gap: 40px;
		padding: 22px 4px;
	}
	.amount-summary div {
		text-align: right;
	}
	.amount-summary span,
	.amount-summary strong {
		display: block;
	}
	.amount-summary span {
		color: #78868d;
		font-size: 0.62rem;
	}
	.amount-summary strong {
		margin-top: 5px;
		font-family: Georgia, serif;
		font-size: 1.25rem;
	}
	.payment-box {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 11px 14px;
		border: 1px solid #b9d4cc;
		padding: 20px;
		background: #eff8f5;
	}
	.asset-mark {
		display: grid;
		width: 42px;
		height: 42px;
		place-items: center;
		color: #1d6353;
		background: #d5ece5;
	}
	.payment-box span,
	.payment-box strong,
	.payment-box small {
		display: block;
	}
	.payment-box span {
		color: #4d7167;
		font-size: 0.56rem;
		font-weight: 850;
		letter-spacing: 0.08em;
	}
	.payment-box strong {
		margin-top: 4px;
		font-size: 1rem;
	}
	.payment-box small {
		margin-top: 2px;
		color: #687e77;
		font-size: 0.62rem;
	}
	.payment-box button {
		display: flex;
		height: 38px;
		align-items: center;
		align-self: center;
		gap: 7px;
		border: 0;
		border-radius: 4px;
		padding: 0 13px;
		color: white;
		background: #164c42;
		font-size: 0.65rem;
		font-weight: 750;
	}
	.payment-box code {
		grid-column: 1 / -1;
		overflow-wrap: anywhere;
		border: 1px solid #c9ddd7;
		padding: 10px;
		color: #24483f;
		background: white;
		font-size: 0.66rem;
	}
	.payment-box p {
		grid-column: 1 / -1;
		color: #765b26;
		font-size: 0.63rem;
		line-height: 1.5;
	}
	.paid-state {
		display: flex;
		align-items: center;
		gap: 12px;
		border: 1px solid #afd6c8;
		padding: 17px;
		color: #245d4d;
		background: #e9f7f1;
	}
	.paid-state strong,
	.paid-state span {
		display: block;
	}
	.paid-state strong {
		font-size: 0.76rem;
	}
	.paid-state span {
		margin-top: 3px;
		font-size: 0.65rem;
	}
	.closed-state {
		border: 1px solid #e1cfad;
		padding: 16px;
		color: #7b5b21;
		background: #fff7e7;
		font-size: 0.7rem;
		line-height: 1.55;
	}
	.notes {
		margin-top: 24px;
		border-top: 1px solid #dce4e6;
		padding-top: 18px;
	}
	.notes p {
		margin-top: 7px;
		color: #607078;
		font-size: 0.72rem;
		line-height: 1.6;
	}
	.pay-footer {
		padding: 18px;
		color: #7a898f;
		font-size: 0.62rem;
		text-align: center;
	}
	@media (max-width: 600px) {
		.pay-header > div {
			display: none;
		}
		.pay-page {
			padding: 18px 10px;
		}
		.line-table {
			overflow-x: auto;
		}
		.line-table header,
		.line-table > div {
			min-width: 570px;
		}
		.payment-box {
			grid-template-columns: auto 1fr;
		}
		.payment-box button {
			grid-column: 1 / -1;
			width: 100%;
			justify-content: center;
		}
	}
</style>
