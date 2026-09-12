<script lang="ts">
	import { ArrowLeft, ArrowRight, Check, ShieldCheck, Zap } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { onMount } from 'svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { selectPaymentRoute, type Asset, type RouteDecision } from '$lib/domain';
	import { workspace } from '$lib/workspace.svelte';

	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const recipients = useQuery(api.recipients.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createPayment = useMutation(api.operations.createPayment);

	let walletId = $state('');
	let recipient = $state('');
	let amount = $state('');
	let asset = $state<Asset>('USDC');
	let reference = $state('');
	let memo = $state('');
	let reviewOpen = $state(false);
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let result = $state<{ operationId: string; path: string; deduplicated: boolean } | null>(null);
	let requestKey = $state('');

	onMount(() => {
		requestKey = crypto.randomUUID();
	});

	let approvedRecipient = $derived(
		recipients.data?.find(
			(item) => item.address.toLowerCase() === recipient.toLowerCase() && item.status === 'approved'
		)
	);
	let route = $derived.by((): RouteDecision => {
		try {
			return selectPaymentRoute({
				asset,
				amount: amount || '0',
				destination: recipient,
				recipientApproved: Boolean(approvedRecipient?.assets.includes(asset))
			});
		} catch {
			return {
				path: 'blocked',
				reason: 'Enter a valid positive amount to preview the control route.',
				requiresPolicyChange: false
			};
		}
	});

	$effect(() => {
		if (!walletId && wallets.data?.[0]) walletId = wallets.data[0]._id;
	});

	function openReview() {
		submitError = null;
		if (!walletId || !recipient || !reference || route.path === 'blocked') {
			submitError = 'Complete the payment details before reviewing this operation.';
			return;
		}
		reviewOpen = true;
	}

	async function submit() {
		if (!workspace.activeOrganizationId || !walletId) return;
		submitting = true;
		submitError = null;
		try {
			const created = await createPayment({
				organizationId: workspace.activeOrganizationId,
				walletId: walletId as NonNullable<typeof wallets.data>[number]['_id'],
				asset,
				amount,
				destination: recipient,
				reference,
				memo: memo || undefined,
				idempotencyKey: requestKey
			});
			result = {
				operationId: created.operationId,
				path: created.decision.path,
				deduplicated: created.deduplicated
			};
			reviewOpen = false;
		} catch (error) {
			submitError =
				error instanceof Error ? error.message : 'Unable to create the payment operation.';
		} finally {
			submitting = false;
		}
	}

	function reset() {
		amount = '';
		reference = '';
		memo = '';
		result = null;
		requestKey = crypto.randomUUID();
	}
</script>

<svelte:head><title>New payment | Ratib</title></svelte:head>

<PageHeader
	eyebrow="NEW OPERATION"
	title="Create payment"
	description="Review the exact asset, amount, address, and control route before Ratib submits anything to Privy."
/>

{#if result}
	<section class="success-state panel">
		<span><Check size={28} /></span>
		<p class="eyebrow">OPERATION CREATED</p>
		<h2>
			{result.path === 'automationSigner'
				? 'Payment submitted for policy-bound execution'
				: 'Privy approval intent requested'}
		</h2>
		<p>
			<strong>{amount} {asset}</strong> to <span class="mono">{recipient}</span> is now tracked by Ratib.
			Privy remains authoritative for signing and execution.
		</p>
		<div class="receipt-grid">
			<div><span>Operation ID</span><strong>{result.operationId}</strong></div>
			<div><span>Control path</span><strong>{result.path}</strong></div>
			<div><span>Request key</span><strong>{requestKey}</strong></div>
		</div>
		{#if result.deduplicated}<p class="dedupe-note">
				This request key already existed, so Ratib returned the original operation without
				scheduling another provider call.
			</p>{/if}
		<div class="result-actions">
			<a class="button secondary" href="/app/approvals">View lifecycle <ArrowRight size={16} /></a
			><button class="button primary" onclick={reset}>Create another</button>
		</div>
	</section>
{:else}
	<div class="payment-grid">
		<form
			class="panel payment-form"
			onsubmit={(event) => {
				event.preventDefault();
				openReview();
			}}
		>
			<header>
				<div>
					<h2>Payment details</h2>
					<p>Executable network: Base Sepolia only.</p>
				</div>
				<span class="step">1 / 2</span>
			</header>
			<label for="recipient">Recipient address</label>
			<input
				id="recipient"
				class="mono"
				bind:value={recipient}
				placeholder="0x…"
				autocomplete="off"
				required
			/>
			{#if recipients.data?.length}<label for="approved-recipient"
					>Or choose an approved counterparty</label
				><select
					id="approved-recipient"
					onchange={(event) => {
						const value = event.currentTarget.value;
						if (value) recipient = value;
					}}
					><option value="">Select approved recipient</option
					>{#each recipients.data.filter((item) => item.status === 'approved' && item.assets.includes(asset)) as item}<option
							value={item.address}
							>{item.label} · {item.address.slice(0, 8)}…{item.address.slice(-5)}</option
						>{/each}</select
				>{/if}
			<label for="wallet">Source wallet</label><select id="wallet" bind:value={walletId} required
				><option value="" disabled>Select a treasury wallet</option
				>{#each wallets.data ?? [] as wallet}<option value={wallet._id}
						>{wallet.name} · {wallet.address.slice(0, 8)}…{wallet.address.slice(-5)}</option
					>{/each}</select
			>
			{#if wallets.data?.length === 0}<p class="field-warning">
					No live treasury wallet is provisioned for this organization.
				</p>{/if}
			<div class="field-pair">
				<div>
					<label for="amount">Amount</label><input
						id="amount"
						bind:value={amount}
						inputmode="decimal"
						placeholder="0.00"
						required
					/>
				</div>
				<div>
					<label for="asset">Asset</label><select id="asset" bind:value={asset}
						><option>USDC</option><option>ETH</option></select
					>
				</div>
			</div>
			<label for="reference">Reference</label><input
				id="reference"
				bind:value={reference}
				maxlength="80"
				placeholder="Invoice, vendor, or internal reference"
				required
			/>
			<label for="memo">Memo <span>optional</span></label><input
				id="memo"
				bind:value={memo}
				maxlength="140"
			/>
			<button
				class="button primary wide"
				type="submit"
				disabled={!wallets.data?.length || route.path === 'blocked'}
				>Review payment <ArrowRight size={16} /></button
			>
			{#if submitError}<p class="form-error" role="alert">{submitError}</p>{/if}
		</form>
		<aside class="panel route-preview">
			<p class="eyebrow">CONTROL ROUTE PREVIEW</p>
			<div
				class:route-auto={route.path === 'automationSigner'}
				class:route-intent={route.path === 'privyIntent'}
				class="route-icon"
			>
				{#if route.path === 'automationSigner'}<Zap size={24} />{:else}<ShieldCheck
						size={24}
					/>{/if}
			</div>
			<h2>
				{route.path === 'automationSigner'
					? 'Policy signer path'
					: route.path === 'privyIntent'
						? 'Quorum approval path'
						: 'Details required'}
			</h2>
			<p>{route.reason}</p>
			<div class="route-path">
				<div class="active">
					<span>1</span>
					<p><strong>Validate operation</strong><small>Organization and record controls</small></p>
				</div>
				<i></i>
				<div class="active">
					<span>2</span>
					<p>
						<strong
							>{route.path === 'automationSigner' ? 'Transfer action' : 'TRANSFER intent'}</strong
						><small>Submitted by the Convex outbox</small>
					</p>
				</div>
				<i></i>
				<div>
					<span>3</span>
					<p>
						<strong
							>{route.path === 'automationSigner' ? 'Policy evaluation' : 'Reviewer quorum'}</strong
						><small>Privy enforces final authority</small>
					</p>
				</div>
			</div>
			<div class="security-note">
				<ShieldCheck size={18} />
				<p>
					This preview never grants permission. Privy evaluates the final wallet and policy
					authority.
				</p>
			</div>
		</aside>
	</div>
{/if}

{#if reviewOpen}
	<div class="modal-backdrop" role="presentation">
		<div class="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
			<button
				class="dialog-back"
				aria-label="Back to payment details"
				onclick={() => (reviewOpen = false)}><ArrowLeft size={17} /></button
			>
			<p class="eyebrow">FINAL REVIEW</p>
			<h2 id="review-title">Confirm the exact transfer request</h2>
			<p>Ratib will create one durable operation and schedule its Privy path after confirmation.</p>
			<dl>
				<div>
					<dt>Amount</dt>
					<dd>{amount} {asset}</dd>
				</div>
				<div>
					<dt>Recipient</dt>
					<dd class="mono">{recipient}</dd>
				</div>
				<div>
					<dt>Source</dt>
					<dd>{wallets.data?.find((wallet) => wallet._id === walletId)?.name}</dd>
				</div>
				<div>
					<dt>Reference</dt>
					<dd>{reference}</dd>
				</div>
				<div>
					<dt>Control path</dt>
					<dd>
						{route.path === 'automationSigner' ? 'Policy-bound transfer' : 'Privy reviewer intent'}
					</dd>
				</div>
				<div>
					<dt>Network</dt>
					<dd>Base Sepolia · 84532</dd>
				</div>
			</dl>
			<div class="review-warning">
				<ShieldCheck size={18} /><span
					>Verify the address and amount. Onchain transfers cannot be reversed after execution.</span
				>
			</div>
			{#if submitError}<p class="form-error" role="alert">{submitError}</p>{/if}
			<div class="dialog-actions">
				<button class="button secondary" onclick={() => (reviewOpen = false)}>Edit details</button
				><button class="button primary" disabled={submitting} onclick={submit}
					>{submitting ? 'Submitting…' : 'Submit to Privy'} <ArrowRight size={15} /></button
				>
			</div>
		</div>
	</div>
{/if}

<style>
	.payment-form label span {
		color: #89959b;
		font-weight: 500;
	}
	.field-warning,
	.dedupe-note {
		color: #965f15;
		background: #fff4dd;
	}
	.field-warning {
		margin-top: 7px;
		padding: 9px;
		font-size: 0.68rem;
	}
	.dedupe-note {
		max-width: 680px;
		padding: 10px 12px;
		font-size: 0.7rem;
	}
	.result-actions {
		display: flex;
		gap: 10px;
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
	.review-dialog {
		position: relative;
		width: min(590px, 100%);
		max-height: calc(100vh - 40px);
		overflow: auto;
		border-radius: 7px;
		padding: 30px;
		background: white;
		box-shadow: 0 25px 70px rgba(0, 0, 0, 0.25);
	}
	.dialog-back {
		position: absolute;
		top: 20px;
		right: 20px;
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid #dbe2e4;
		border-radius: 5px;
		background: white;
	}
	.review-dialog h2 {
		margin: 12px 0 8px;
		font-family: Georgia, serif;
		font-size: 1.65rem;
		font-weight: 500;
	}
	.review-dialog > p:not(.eyebrow, .form-error) {
		color: #6c7b82;
		font-size: 0.75rem;
		line-height: 1.55;
	}
	.review-dialog dl {
		margin: 22px 0;
		border-top: 1px solid #dfe6e8;
	}
	.review-dialog dl div {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr);
		gap: 16px;
		border-bottom: 1px solid #dfe6e8;
		padding: 11px 0;
		font-size: 0.72rem;
	}
	.review-dialog dt {
		color: #74838a;
	}
	.review-dialog dd {
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
		font-weight: 750;
	}
	.review-warning {
		display: flex;
		gap: 10px;
		padding: 12px;
		color: #724b17;
		background: #fff3dc;
		font-size: 0.7rem;
		line-height: 1.5;
	}
	.review-warning :global(svg) {
		flex: 0 0 auto;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 22px;
	}
	@media (max-width: 560px) {
		.review-dialog {
			padding: 24px 18px;
		}
		.review-dialog dl div {
			grid-template-columns: 90px minmax(0, 1fr);
		}
		.dialog-actions {
			flex-direction: column-reverse;
		}
		.dialog-actions .button {
			width: 100%;
		}
	}
</style>
