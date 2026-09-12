<script lang="ts">
	import { Building2, Check, Circle, RefreshCw, ShieldCheck, WalletCards } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const runs = useQuery(api.provisioning.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createOrganization = useMutation(api.organizations.createAndProvision);
	const createWallet = useMutation(api.wallets.create);
	const retryRun = useMutation(api.provisioning.retry);
	let name = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function startOrganization() {
		submitting = true;
		error = null;
		try {
			await createOrganization({ name, requestKey: crypto.randomUUID() });
			name = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to create the organization.';
		} finally {
			submitting = false;
		}
	}
	async function setupTreasury() {
		if (!workspace.activeOrganizationId) return;
		submitting = true;
		error = null;
		try {
			await createWallet({
				organizationId: workspace.activeOrganizationId,
				name: 'Operating Treasury',
				requestKey: crypto.randomUUID()
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to start treasury setup.';
		} finally {
			submitting = false;
		}
	}
	async function retry(id: Id<'provisioningRuns'>) {
		if (!workspace.activeOrganizationId) return;
		try {
			await retryRun({ organizationId: workspace.activeOrganizationId, provisioningRunId: id });
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to retry provisioning.';
		}
	}
	const stages = ['Quorum', 'Policy', 'Wallet'];
	function completeStage(status: string, index: number) {
		const order = [
			'pending',
			'claimed',
			'quorumCreated',
			'policyCreated',
			'walletCreated',
			'succeeded'
		];
		return order.indexOf(status) >= index + 2 || status === 'succeeded';
	}
</script>

<svelte:head><title>Setup | Ratib</title></svelte:head>
<PageHeader
	eyebrow="SELF-SERVICE ONBOARDING"
	title="Workspace setup"
	description="Create the organization, its Privy user quorum, Base Sepolia policy, and first treasury without leaving Ratib."
/>

{#if !workspace.activeOrganizationId}
	<section class="panel create-panel">
		<div class="setup-icon"><Building2 size={28} /></div>
		<p class="eyebrow">NEW ORGANIZATION</p>
		<h2>Create your Ratib workspace</h2>
		<p>Your verified Privy identity becomes the initial owner and 1-of-1 approver.</p>
		<form
			onsubmit={(event) => {
				event.preventDefault();
				void startOrganization();
			}}
		>
			<label for="organization-name">Organization name</label>
			<input id="organization-name" bind:value={name} minlength="2" maxlength="100" required />
			<button class="button primary" type="submit" disabled={submitting}
				>{submitting ? 'Creating…' : 'Create organization'} <Building2 size={15} /></button
			>
		</form>
		{#if error}<p class="form-error" role="alert">{error}</p>{/if}
	</section>
{:else}
	<div class="setup-layout">
		<section class="panel">
			<header>
				<div>
					<h2>Treasury provisioning</h2>
					<p>Durable provider runs for Base Sepolia.</p>
				</div>
				<ShieldCheck size={19} />
			</header>
			{#if !runs.data?.length && wallets.data?.length === 0}
				<div class="action-state">
					<WalletCards size={30} />
					<h3>Set up your treasury</h3>
					<p>Create a Privy user quorum, a default ETH/USDC policy, and an organization wallet.</p>
					<button class="button primary" onclick={setupTreasury} disabled={submitting}
						>{submitting ? 'Starting…' : 'Set up treasury'}</button
					>
				</div>
			{:else}
				<div class="run-list">
					{#each runs.data ?? [] as run}
						<article>
							<div class="run-heading">
								<div>
									<strong>{run.walletName}</strong><small class="mono"
										>{run.providerReferenceId}</small
									>
								</div>
								<StatusBadge status={run.status} />
							</div>
							<div class="stages">
								{#each stages as stage, index}<span class:done={completeStage(run.status, index)}
										>{#if completeStage(run.status, index)}<Check size={14} />{:else}<Circle
												size={14}
											/>{/if}{stage}</span
									>{/each}
							</div>
							{#if run.errorCode}<p class="run-error">{run.errorCode}</p>{/if}
							{#if run.status === 'failed' || run.status === 'ambiguous'}<button
									class="button secondary"
									onclick={() => retry(run._id)}
									><RefreshCw size={14} />
									{run.status === 'ambiguous' ? 'Reconcile' : 'Retry'}</button
								>{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>
		<aside class="panel security">
			<ShieldCheck size={25} />
			<p class="eyebrow">SECURITY BOUNDARY</p>
			<h2>Privy remains the authority</h2>
			<p>
				Ratib orchestrates key quorums, policy intents, MFA, and signatures in product.
				Authorization material is never stored.
			</p>
			<code>Base Sepolia · eip155:84532</code><code>Circle USDC · 0x036C…7e</code>
		</aside>
	</div>
	{#if error}<p class="form-error page-error" role="alert">{error}</p>{/if}
{/if}

<style>
	.create-panel {
		display: grid;
		min-height: 460px;
		place-items: center;
		align-content: center;
		padding: 36px;
		text-align: center;
	}
	.setup-icon {
		display: grid;
		width: 54px;
		height: 54px;
		place-items: center;
		border-radius: 7px;
		color: #fff;
		background: #173f4d;
	}
	.create-panel h2,
	.action-state h3,
	.security h2 {
		margin: 9px 0;
		font-family: Georgia, serif;
		font-size: 1.45rem;
		font-weight: 500;
	}
	.create-panel > p:not(.eyebrow),
	.action-state p,
	.security > p:not(.eyebrow) {
		max-width: 520px;
		color: #6d7c82;
		font-size: 0.76rem;
		line-height: 1.65;
	}
	.create-panel form {
		display: grid;
		width: min(430px, 100%);
		margin-top: 20px;
		text-align: left;
	}
	.create-panel label {
		margin-bottom: 6px;
		font-size: 0.67rem;
		font-weight: 750;
	}
	.create-panel input {
		border: 1px solid #d4dde0;
		border-radius: 5px;
		padding: 11px;
		font: inherit;
	}
	.create-panel .button {
		justify-self: start;
		margin-top: 12px;
	}
	.setup-layout {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(270px, 0.7fr);
		gap: 14px;
	}
	.action-state {
		display: grid;
		min-height: 320px;
		place-items: center;
		align-content: center;
		padding: 28px;
		text-align: center;
	}
	.action-state :global(svg),
	.security :global(svg) {
		color: #397563;
	}
	.run-list article {
		display: grid;
		gap: 14px;
		border-bottom: 1px solid #e0e6e8;
		padding: 18px;
	}
	.run-heading {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.run-heading strong,
	.run-heading small {
		display: block;
	}
	.run-heading small {
		margin-top: 5px;
		color: #7b898f;
		font-size: 0.55rem;
	}
	.stages {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.stages span {
		display: flex;
		align-items: center;
		gap: 6px;
		border: 1px solid #dce4e6;
		padding: 8px;
		color: #78868c;
		font-size: 0.63rem;
	}
	.stages span.done {
		color: #286454;
		background: #eff6f3;
	}
	.run-error {
		color: #9d4039;
		font-size: 0.65rem;
	}
	.run-list .button {
		width: fit-content;
	}
	.security {
		display: grid;
		align-content: start;
		gap: 7px;
		padding: 24px;
	}
	.security code {
		display: block;
		margin-top: 5px;
		border: 1px solid #dce4e6;
		padding: 8px;
		font-size: 0.6rem;
	}
	.page-error {
		margin-top: 12px;
	}
	@media (max-width: 800px) {
		.setup-layout {
			grid-template-columns: 1fr;
		}
		.stages {
			grid-template-columns: 1fr;
		}
		.create-panel {
			padding: 24px 16px;
		}
	}
</style>
