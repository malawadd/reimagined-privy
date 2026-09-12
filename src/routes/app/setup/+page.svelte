<script lang="ts">
	import { Check, Circle, Clock3, ExternalLink, Send, ShieldCheck } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const summary = useQuery(api.dashboard.get, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const pilotRequests = useQuery(api.organizations.listPilotRequests, () =>
		privyAuth.user ? {} : 'skip'
	);
	const requestPilotAccess = useMutation(api.organizations.requestPilotAccess);
	let companyName = $state('');
	let contactEmail = $state(privyAuth.user?.email ?? '');
	let useCase = $state('');
	let submitting = $state(false);
	let submitError = $state<string | null>(null);

	let steps = $derived([
		{
			name: 'Business approved',
			detail: 'Workspace activated for the controlled pilot.',
			done: Boolean(workspace.activeOrganizationId)
		},
		{
			name: 'Reviewer quorum',
			detail: 'Privy Dashboard reviewers and MFA authority synchronized.',
			done: Boolean(summary.data?.quorum)
		},
		{
			name: 'Treasury wallet',
			detail: 'A policy-owned Base Sepolia wallet is provisioned.',
			done: (summary.data?.walletCount ?? 0) > 0
		},
		{
			name: 'Owner policy',
			detail: 'Default-deny wallet controls are mirrored from Privy.',
			done: (summary.data?.policyCount ?? 0) > 0
		},
		{
			name: 'Finance team',
			detail: 'A second team member has an explicit application role.',
			done: (summary.data?.memberCount ?? 0) > 1
		},
		{
			name: 'Operational proof',
			detail: 'A testnet operation has completed with linked evidence.',
			done: Boolean(
				summary.data?.recentOperations.some((operation) => operation.status === 'succeeded')
			)
		}
	]);
	let completeCount = $derived(steps.filter((step) => step.done).length);

	async function submitRequest() {
		submitting = true;
		submitError = null;
		try {
			await requestPilotAccess({ companyName, contactEmail, useCase });
			companyName = '';
			useCase = '';
		} catch (error) {
			submitError = error instanceof Error ? error.message : 'Unable to submit the pilot request.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Setup | Ratib</title></svelte:head>

<PageHeader
	eyebrow="CONTROLLED ONBOARDING"
	title="Pilot setup"
	description="Verify the business, establish Privy authority, and prove the Base Sepolia operating path."
/>

{#if !workspace.activeOrganizationId}
	<div class="setup-grid">
		<section class="panel request-panel">
			{#if pilotRequests.isLoading}
				<div class="request-state">
					<Clock3 size={25} />
					<h2>Checking pilot status</h2>
				</div>
			{:else if pilotRequests.data?.length}
				<div class="request-state">
					<Clock3 size={28} />
					<p class="eyebrow">REQUEST RECEIVED</p>
					<h2>{pilotRequests.data[0].name}</h2>
					<p>
						Your controlled-pilot request is awaiting manual review. Wallets and money movement
						remain disabled until the business and Privy control setup are approved.
					</p>
					<dl>
						<div>
							<dt>Contact</dt>
							<dd>{pilotRequests.data[0].pilotContactEmail}</dd>
						</div>
						<div>
							<dt>Submitted</dt>
							<dd>
								{pilotRequests.data[0].requestedAt
									? new Date(pilotRequests.data[0].requestedAt).toLocaleString()
									: 'Recorded'}
							</dd>
						</div>
						<div>
							<dt>Status</dt>
							<dd>Pending review</dd>
						</div>
					</dl>
				</div>
			{:else}
				<header>
					<div>
						<h2>Request pilot access</h2>
						<p>Tell us which real finance workflow Ratib will support.</p>
					</div>
					<Send size={19} />
				</header>
				<form
					onsubmit={(event) => {
						event.preventDefault();
						void submitRequest();
					}}
				>
					<label for="company-name">Legal or operating company name</label><input
						id="company-name"
						bind:value={companyName}
						minlength="2"
						maxlength="100"
						required
					/>
					<label for="contact-email">Pilot contact email</label><input
						id="contact-email"
						type="email"
						autocomplete="email"
						bind:value={contactEmail}
						required
					/>
					<label for="use-case">Digital asset operating use case</label><textarea
						id="use-case"
						bind:value={useCase}
						minlength="20"
						maxlength="1000"
						rows="6"
						placeholder="Describe assets, payment volume, approvers, and the workflow you need to operate."
						required></textarea>
					<p>
						Submitting does not create a wallet or enable transactions. A Ratib operator must verify
						and activate the organization.
					</p>
					<button class="button primary" type="submit" disabled={submitting}
						>{submitting ? 'Submitting…' : 'Submit pilot request'} <Send size={14} /></button
					>
					{#if submitError}<div class="form-error" role="alert">{submitError}</div>{/if}
				</form>
			{/if}
		</section>
		<aside class="side-stack">
			<section class="panel production-gate">
				<ShieldCheck size={24} />
				<p class="eyebrow">ACTIVATION BOUNDARY</p>
				<h2>Manual and fail closed</h2>
				<p>
					Ratib verifies the organization, reviewer quorum, owner policy, and wallet configuration
					before enabling live provider actions.
				</p>
				<code>Base Sepolia · chain 84532</code><code>Privy authority required</code>
			</section>
		</aside>
	</div>
{:else}
	<div class="setup-grid">
		<section class="panel setup-list">
			<header>
				<div>
					<h2>Workspace readiness</h2>
					<p>Live provider configuration · Base Sepolia</p>
				</div>
				<strong>{completeCount} / {steps.length}</strong>
			</header>
			{#each steps as step, index}<article class:incomplete={!step.done}>
					<span
						>{#if step.done}<Check size={17} />{:else}<Circle size={17} />{/if}</span
					>
					<div>
						<small>STEP {index + 1}</small>
						<h3>{step.name}</h3>
						<p>{step.detail}</p>
					</div>
					<a
						href={index === 4
							? '/app/team'
							: index === 5
								? '/app/audit'
								: index > 0
									? '/app/wallets'
									: '/app/setup'}>{step.done ? 'Review' : 'Pending'} <ExternalLink size={13} /></a
					>
				</article>{/each}
		</section>
		<aside class="side-stack">
			<section class="panel production-gate">
				<ShieldCheck size={24} />
				<p class="eyebrow">PRODUCTION GATE</p>
				<h2>Fail closed by design</h2>
				<p>
					A production build requires browser-safe Privy and Convex configuration. Server
					credentials, authorization keys, and webhook secrets stay in Convex environment variables.
				</p>
				<code>Privy live provider only</code><code>HTTPS Convex site required</code>
			</section>
			<section class="panel">
				<h2>Environment separation</h2>
				<p class="muted">
					Development and production use independent Privy and Convex projects, keys, webhook
					endpoints, and wallet funding.
				</p>
			</section>
		</aside>
	</div>
{/if}

<style>
	.request-panel {
		min-height: 530px;
	}
	.request-panel form {
		display: grid;
		padding: 24px;
	}
	.request-panel label {
		margin: 15px 0 7px;
		color: #34474f;
		font-size: 0.7rem;
		font-weight: 750;
	}
	.request-panel input,
	.request-panel textarea {
		width: 100%;
		border: 1px solid #d4dde0;
		border-radius: 5px;
		padding: 11px 12px;
		color: #22343b;
		background: white;
		font: inherit;
		font-size: 0.78rem;
	}
	.request-panel textarea {
		resize: vertical;
		line-height: 1.55;
	}
	.request-panel form > p {
		margin: 14px 0;
		color: #738189;
		font-size: 0.67rem;
		line-height: 1.55;
	}
	.request-panel form .button {
		width: fit-content;
	}
	.request-state {
		display: grid;
		min-height: 440px;
		place-items: center;
		align-content: center;
		padding: 35px;
		text-align: center;
	}
	.request-state :global(svg) {
		color: #b27422;
	}
	.request-state h2 {
		margin-top: 10px;
		font-family: Georgia, serif;
		font-size: 1.55rem;
	}
	.request-state > p:not(.eyebrow) {
		max-width: 560px;
		margin-top: 10px;
		color: #68787f;
		font-size: 0.78rem;
		line-height: 1.65;
	}
	.request-state dl {
		width: min(480px, 100%);
		margin: 26px 0 0;
		border-top: 1px solid #e0e6e8;
	}
	.request-state dl div {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid #e0e6e8;
		padding: 12px 2px;
		font-size: 0.7rem;
	}
	.request-state dt {
		color: #7b898f;
	}
	.request-state dd {
		margin: 0;
		font-weight: 750;
	}
	.setup-list article a {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.66rem;
		font-weight: 750;
	}
</style>
