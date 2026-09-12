<script lang="ts">
	import { Check, Code2, History, ShieldCheck } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const policies = useQuery(api.policies.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const recipients = useQuery(api.recipients.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createAutomationPolicy = useMutation(api.policies.createAutomationPolicy);
	const requestUpdate = useMutation(api.policies.requestAutomationPolicyUpdate);
	let name = $state('Vendor payment boundary');
	let limit = $state('100');
	let treasuryDestination = $state('');
	let selectedRecipients = $state<string[]>([]);
	let selectedPolicyId = $state('');
	let submitting = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!treasuryDestination && wallets.data?.[0]) treasuryDestination = wallets.data[0].address;
		if (selectedRecipients.length === 0 && recipients.data?.length)
			selectedRecipients = recipients.data
				.filter((item) => item.status === 'approved' && item.assets.includes('USDC'))
				.map((item) => item.address);
		if (!selectedPolicyId)
			selectedPolicyId =
				policies.data?.find((policy) => policy.kind !== 'owner' && policy.status === 'active')
					?._id ?? '';
	});

	const preview = useQuery(api.policies.previewAutomation, () =>
		workspace.activeOrganizationId && treasuryDestination && selectedRecipients.length
			? {
					organizationId: workspace.activeOrganizationId,
					approvedRecipients: selectedRecipients,
					treasuryDestination,
					automationLimitUsdc: limit
				}
			: 'skip'
	);

	function toggleRecipient(address: string) {
		selectedRecipients = selectedRecipients.includes(address)
			? selectedRecipients.filter((item) => item !== address)
			: [...selectedRecipients, address];
	}

	async function submitPolicy() {
		if (!workspace.activeOrganizationId || !preview.data) return;
		const action = selectedPolicyId ? 'create a Privy approval intent to update' : 'create';
		if (
			!confirm(
				`Confirm ${action} the policy “${name}” with a ${limit} USDC ceiling and ${selectedRecipients.length} approved recipient(s)?`
			)
		)
			return;
		submitting = true;
		message = null;
		error = null;
		try {
			const common = {
				organizationId: workspace.activeOrganizationId,
				name,
				approvedRecipients: selectedRecipients,
				treasuryDestination,
				automationLimitUsdc: limit
			};
			if (selectedPolicyId) {
				const operationId = await requestUpdate({
					...common,
					policyId: selectedPolicyId as NonNullable<typeof policies.data>[number]['_id']
				});
				message = `Policy update operation ${operationId} was submitted to Privy for owner approval.`;
			} else {
				const result = await createAutomationPolicy(common);
				message = `Policy creation was queued with correlation ${result.correlationId}.`;
			}
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to submit this policy workflow.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head><title>Policies | Ratib</title></svelte:head>

<PageHeader
	eyebrow="AUTHORIZATION"
	title="Policy builder"
	description="Compile bounded templates, inspect provider JSON, and submit administrative changes through native Privy workflows."
>
	{#snippet action()}<a class="button secondary" href="#policy-inventory"
			><History size={15} /> Policy inventory</a
		>{/snippet}
</PageHeader>

<div class="policy-grid">
	<section class="panel policy-builder">
		<header>
			<div>
				<h2>Automation boundary</h2>
				<p>Base Sepolia USDC transfer and treasury sweep rules.</p>
			</div>
			<StatusBadge status={selectedPolicyId ? 'active' : 'draft'} />
		</header>
		<label for="policy-name">Policy name</label><input
			id="policy-name"
			bind:value={name}
			maxlength="100"
		/>
		<label for="limit">Per-transfer ceiling</label>
		<div class="input-suffix">
			<input id="limit" bind:value={limit} inputmode="decimal" /><span>USDC</span>
		</div>
		<label for="treasury-destination">Treasury sweep destination</label><select
			id="treasury-destination"
			bind:value={treasuryDestination}
			><option value="" disabled>Select a treasury wallet</option
			>{#each wallets.data ?? [] as wallet}<option value={wallet.address}
					>{wallet.name} · {wallet.address.slice(0, 8)}…</option
				>{/each}</select
		>
		<div class="field-label">Approved USDC recipients</div>
		<div class="policy-recipients">
			{#each (recipients.data ?? []).filter((item) => item.status === 'approved' && item.assets.includes('USDC')) as recipient}<label
					><input
						type="checkbox"
						checked={selectedRecipients.includes(recipient.address)}
						onchange={() => toggleRecipient(recipient.address)}
					/><span
						><strong>{recipient.label}</strong><small class="mono">{recipient.address}</small></span
					></label
				>{/each}{#if recipients.data?.length === 0}<p>
					No approved USDC counterparties are available. Add one before compiling an automation
					policy.
				</p>{/if}
		</div>
		<div class="rule-list">
			<h3>Effective restrictions</h3>
			<p><Check size={15} /> Chain is exactly Base Sepolia (84532)</p>
			<p><Check size={15} /> Asset is exactly USDC</p>
			<p><Check size={15} /> Transfer action only</p>
			<p><Check size={15} /> Unknown recipients are denied</p>
			<p><Check size={15} /> All unspecified behavior defaults to deny</p>
		</div>
		<button
			class="button primary wide"
			disabled={submitting || !preview.data}
			onclick={submitPolicy}
			>{submitting
				? 'Submitting…'
				: selectedPolicyId
					? 'Request policy update'
					: 'Create controlled policy'}
			<ShieldCheck size={15} /></button
		>
		{#if message}<p class="intent-notice" role="status">{message}</p>{/if}{#if error}<p
				class="form-error"
				role="alert"
			>
				{error}
			</p>{/if}
	</section>
	<section class="panel code-preview">
		<header>
			<div>
				<h2>Generated Privy JSON</h2>
				<p>Compiled and validated by the organization-scoped Convex query.</p>
			</div>
			<Code2 size={19} />
		</header>
		{#if preview.isLoading}<div class="preview-empty">
				Compiling policy…
			</div>{:else if preview.error}<div class="preview-empty error">
				{preview.error.message}
			</div>{:else if preview.data}<pre>{JSON.stringify(preview.data, null, 2)}</pre>{:else}<div
				class="preview-empty"
			>
				Select a treasury wallet and at least one approved recipient.
			</div>{/if}
		<div class="security-note">
			<ShieldCheck size={18} />
			<p>
				Policy updates always create a Privy intent. Ratib exposes no direct privileged update path.
			</p>
		</div>
	</section>
</div>

<section class="panel policy-inventory" id="policy-inventory">
	<header>
		<div>
			<h2>Mirrored policy inventory</h2>
			<p>Provider IDs and states synchronized from Privy.</p>
		</div>
		<span>{policies.data?.length ?? 0} policies</span>
	</header>
	{#if policies.data?.length}<div class="table-wrap">
			<table>
				<thead
					><tr><th>Policy</th><th>Kind</th><th>Version</th><th>Privy ID</th><th>Status</th></tr
					></thead
				><tbody
					>{#each policies.data as policy}<tr
							><td><strong>{policy.name}</strong></td><td>{policy.kind}</td><td>{policy.version}</td
							><td class="mono small">{policy.privyPolicyId}</td><td
								><StatusBadge status={policy.status} /></td
							></tr
						>{/each}</tbody
				>
			</table>
		</div>{:else}<div class="preview-empty">
			No Privy policies have been mirrored for this organization.
		</div>{/if}
</section>

<style>
	.policy-builder > input,
	.policy-builder > select {
		width: 100%;
		border: 1px solid #d6dfe2;
		border-radius: 5px;
		padding: 10px;
		font: inherit;
		font-size: 0.75rem;
	}
	.policy-recipients {
		display: grid;
		gap: 6px;
		margin: 8px 0 18px;
	}
	.policy-recipients label {
		display: flex;
		align-items: center;
		gap: 10px;
		border: 1px solid #e0e6e8;
		padding: 9px;
	}
	.policy-recipients label span,
	.policy-recipients strong,
	.policy-recipients small {
		display: block;
		min-width: 0;
	}
	.policy-recipients strong {
		font-size: 0.7rem;
	}
	.policy-recipients small {
		margin-top: 3px;
		overflow: hidden;
		color: #78868c;
		font-size: 0.58rem;
		text-overflow: ellipsis;
	}
	.policy-recipients > p,
	.preview-empty {
		color: #748188;
		font-size: 0.72rem;
		line-height: 1.55;
	}
	.preview-empty {
		display: grid;
		min-height: 330px;
		place-items: center;
		padding: 25px;
		text-align: center;
	}
	.preview-empty.error {
		color: #9b4039;
	}
	.policy-inventory {
		margin-top: 16px;
	}
	.policy-inventory header > span {
		color: #77858b;
		font-size: 0.68rem;
	}
</style>
