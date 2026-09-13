<script lang="ts">
	import { Ban, Check, ContactRound, Plus, Search, ShieldCheck } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const recipients = useQuery(api.recipients.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createRecipient = useMutation(api.recipients.create);
	const approveRecipient = useMutation(api.recipients.approve);
	const revokeRecipient = useMutation(api.recipients.revoke);
	let query = $state('');
	let adding = $state(false);
	let label = $state('');
	let address = $state('');
	let allowUsdc = $state(true);
	let allowEth = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let filtered = $derived(
		(recipients.data ?? []).filter((recipient) =>
			`${recipient.label} ${recipient.address} ${recipient.status}`
				.toLowerCase()
				.includes(query.toLowerCase())
		)
	);

	async function save() {
		if (!workspace.activeOrganizationId) return;
		saving = true;
		error = null;
		try {
			await createRecipient({
				organizationId: workspace.activeOrganizationId,
				label,
				address,
				assets: [...(allowUsdc ? ['USDC' as const] : []), ...(allowEth ? ['ETH' as const] : [])]
			});
			label = '';
			address = '';
			adding = false;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to approve this counterparty.';
		} finally {
			saving = false;
		}
	}

	async function revoke(recipientId: NonNullable<typeof recipients.data>[number]['_id']) {
		if (
			!workspace.activeOrganizationId ||
			!confirm('Revoke this counterparty from future policy routing?')
		)
			return;
		await revokeRecipient({ organizationId: workspace.activeOrganizationId, recipientId });
	}

	async function approve(recipientId: NonNullable<typeof recipients.data>[number]['_id']) {
		if (!workspace.activeOrganizationId) return;
		error = null;
		try {
			await approveRecipient({ organizationId: workspace.activeOrganizationId, recipientId });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to approve this counterparty.';
		}
	}
</script>

<svelte:head><title>Counterparties | Ratib</title></svelte:head>

<PageHeader
	eyebrow="PAYMENT DIRECTORY"
	title="Counterparties"
	description="EVM destinations use maker-checker approval. Automation also requires an attached Privy policy."
>
	{#snippet action()}<button class="button primary" onclick={() => (adding = true)}
			><Plus size={15} /> Add counterparty</button
		>{/snippet}
</PageHeader>

<div class="authority-banner">
	<ShieldCheck size={21} />
	<div>
		<strong>Approval is asset-specific</strong>
		<p>
			A directory entry informs Ratib's route preview. Privy still evaluates the wallet and signer
			policy at execution time.
		</p>
	</div>
</div>

{#if error && !adding}<p class="form-error" role="alert">{error}</p>{/if}

<section class="panel directory-panel">
	<header>
		<div class="search audit-search">
			<Search size={16} /><input
				bind:value={query}
				aria-label="Search counterparties"
				placeholder="Search label, address, or status…"
			/>
		</div>
		<span>{filtered.length} counterparties</span>
	</header>
	{#if recipients.isLoading}<div class="directory-empty">Loading organization counterparties…</div>
	{:else if recipients.error}<div class="directory-empty error" role="alert">
			{recipients.error.message}
		</div>
	{:else if filtered.length === 0}<div class="directory-empty">
			<ContactRound size={25} /><strong
				>{query ? 'No matching counterparties' : 'No counterparties yet'}</strong
			><span>Approved payment destinations will appear here.</span>
		</div>
	{:else}<div class="table-wrap">
			<table>
				<thead
					><tr
						><th>Counterparty</th><th>Address</th><th>Allowed assets</th><th>Status</th><th
						></th></tr
					></thead
				><tbody
					>{#each filtered as recipient}<tr
							><td><strong>{recipient.label}</strong></td><td class="mono small"
								>{recipient.address}</td
							><td>{recipient.assets.join(', ')}</td><td
								><StatusBadge status={recipient.status} /></td
							><td class="row-actions"
								>{#if recipient.status === 'pendingApproval'}<button
										class="button secondary compact"
										aria-label={`Approve ${recipient.label}`}
										title="Approve counterparty"
										onclick={() => approve(recipient._id)}><Check size={15} /> Approve</button
									>{/if}{#if recipient.status !== 'revoked'}<button
										class="icon-button danger"
										aria-label={`Revoke ${recipient.label}`}
										title="Revoke counterparty"
										onclick={() => revoke(recipient._id)}><Ban size={15} /></button
									>{/if}</td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</section>

{#if adding}
	<div class="modal-backdrop" role="presentation">
		<div
			class="recipient-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="counterparty-title"
		>
			<p class="eyebrow">DESTINATION REQUEST</p>
			<h2 id="counterparty-title">Add counterparty</h2>
			<p>A different owner or admin must approve the normalized address before it can be reused.</p>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					void save();
				}}
			>
				<label for="counterparty-label">Display label</label><input
					id="counterparty-label"
					bind:value={label}
					maxlength="100"
					required
				/><label for="counterparty-address">EVM address</label><input
					id="counterparty-address"
					class="mono"
					bind:value={address}
					placeholder="0x…"
					required
				/>
				<fieldset>
					<legend>Allowed assets</legend><label
						><input type="checkbox" bind:checked={allowUsdc} /> USDC</label
					><label><input type="checkbox" bind:checked={allowEth} /> ETH</label>
				</fieldset>
				{#if error}<p class="form-error" role="alert">{error}</p>{/if}
				<div class="dialog-actions">
					<button class="button secondary" type="button" onclick={() => (adding = false)}
						>Cancel</button
					><button class="button primary" type="submit" disabled={saving}
						>{saving ? 'Saving…' : 'Request approval'} <Check size={14} /></button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.directory-panel > header {
		align-items: center;
	}
	.directory-panel > header > span {
		color: #78868c;
		font-size: 0.68rem;
	}
	.directory-empty {
		display: grid;
		min-height: 260px;
		place-items: center;
		align-content: center;
		gap: 8px;
		color: #748289;
		font-size: 0.74rem;
		text-align: center;
	}
	.directory-empty :global(svg) {
		color: #3a7967;
	}
	.directory-empty strong {
		color: #2b3d44;
		font-family: Georgia, serif;
		font-size: 1.2rem;
	}
	.directory-empty.error {
		color: #9b3d36;
	}
	.icon-button.danger {
		color: #9b453f;
	}
	.row-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
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
	.recipient-dialog {
		width: min(500px, 100%);
		border-radius: 7px;
		padding: 28px;
		background: white;
	}
	.recipient-dialog h2 {
		margin: 11px 0 7px;
		font-family: Georgia, serif;
		font-size: 1.6rem;
		font-weight: 500;
	}
	.recipient-dialog > p:not(.eyebrow) {
		color: #6f7d83;
		font-size: 0.72rem;
		line-height: 1.55;
	}
	.recipient-dialog form {
		display: grid;
		margin-top: 16px;
	}
	.recipient-dialog form > label,
	.recipient-dialog legend {
		margin: 12px 0 6px;
		color: #354951;
		font-size: 0.68rem;
		font-weight: 750;
	}
	.recipient-dialog form > input {
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 10px;
		font: inherit;
		font-size: 0.76rem;
	}
	.recipient-dialog fieldset {
		display: flex;
		gap: 18px;
		margin: 13px 0 0;
		border: 0;
		padding: 0;
	}
	.recipient-dialog fieldset label {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.72rem;
	}
	.dialog-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 22px;
	}
</style>
