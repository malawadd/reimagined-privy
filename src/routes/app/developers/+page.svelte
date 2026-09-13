<script lang="ts">
	import {
		Activity,
		Ban,
		Check,
		Download,
		KeyRound,
		Plus,
		RefreshCw,
		Send,
		ShieldCheck,
		Webhook
	} from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';
	import { DEVELOPER_API_SCOPES, type DeveloperApiScope } from '$lib/developer-api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import openApi from '../../../../docs/api/ratib-v1.openapi.yaml?raw';
	import typescriptSdk from '../../../../docs/api/sdk/typescript/ratib.ts?raw';
	import pythonSdk from '../../../../docs/api/sdk/python/ratib.py?raw';

	const accounts = useQuery(api.developerAccounts.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const webhooks = useQuery(api.developerWebhooks.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const requestLogs = useQuery(api.developerAccounts.listRequestLogs, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const createAccount = useMutation(api.developerAccounts.create);
	const revokeAccount = useMutation(api.developerAccounts.revoke);
	const revokeCredential = useMutation(api.developerAccounts.revokeCredential);
	const createWebhook = useMutation(api.developerWebhooks.create);
	const setWebhookStatus = useMutation(api.developerWebhooks.setStatus);
	const sendWebhookTest = useMutation(api.developerWebhooks.sendTest);
	const replayDelivery = useMutation(api.developerWebhooks.replay);

	let tab = $state<'accounts' | 'webhooks' | 'logs'>('accounts');
	let showAccountForm = $state(false);
	let showWebhookForm = $state(false);
	let name = $state('');
	let purpose = $state('');
	let selectedScopes = $state<DeveloperApiScope[]>(['org:read', 'wallets:read', 'operations:read']);
	let selectedWalletIds = $state<Id<'wallets'>[]>([]);
	let webhookUrl = $state('');
	let webhookEvents = $state<string[]>([
		'operation.created',
		'operation.succeeded',
		'operation.failed'
	]);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);

	function toggleScope(scope: DeveloperApiScope) {
		selectedScopes = selectedScopes.includes(scope)
			? selectedScopes.filter((item) => item !== scope)
			: [...selectedScopes, scope];
	}

	function toggleWallet(walletId: Id<'wallets'>) {
		selectedWalletIds = selectedWalletIds.includes(walletId)
			? selectedWalletIds.filter((item) => item !== walletId)
			: [...selectedWalletIds, walletId];
	}

	async function addAccount(event: SubmitEvent) {
		event.preventDefault();
		const organizationId = workspace.activeOrganizationId;
		if (!organizationId) return;
		busy = true;
		error = null;
		notice = null;
		try {
			const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
				'sign',
				'verify'
			]);
			const [publicJwk, privateJwk] = await Promise.all([
				crypto.subtle.exportKey('jwk', pair.publicKey),
				crypto.subtle.exportKey('jwk', pair.privateKey)
			]);
			const keyId = `rcred_${crypto.randomUUID().replaceAll('-', '')}`;
			await createAccount({
				organizationId,
				name,
				purpose,
				scopes: selectedScopes,
				walletIds: selectedWalletIds,
				keyId,
				publicJwk
			});
			download(
				`ratib-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'service-account'}.json`,
				JSON.stringify({ keyId, algorithm: 'ES256', privateJwk }, null, 2),
				'application/json'
			);
			name = '';
			purpose = '';
			selectedScopes = ['org:read', 'wallets:read', 'operations:read'];
			selectedWalletIds = [];
			showAccountForm = false;
			notice = `Credential ${keyId} created. Its private key was downloaded once.`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to create service account.';
		} finally {
			busy = false;
		}
	}

	async function addWebhook(event: SubmitEvent) {
		event.preventDefault();
		const organizationId = workspace.activeOrganizationId;
		if (!organizationId) return;
		busy = true;
		error = null;
		try {
			await createWebhook({
				organizationId,
				url: webhookUrl,
				eventTypes: webhookEvents
			});
			webhookUrl = '';
			showWebhookForm = false;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to create webhook endpoint.';
		} finally {
			busy = false;
		}
	}

	async function act(action: () => Promise<unknown>, fallback: string) {
		busy = true;
		error = null;
		try {
			await action();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : fallback;
		} finally {
			busy = false;
		}
	}

	function download(name: string, body: string, type: string) {
		const url = URL.createObjectURL(new Blob([body], { type }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = name;
		anchor.click();
		URL.revokeObjectURL(url);
	}

	function activeOrganizationId(): Id<'organizations'> {
		if (!workspace.activeOrganizationId) throw new Error('Select an organization first.');
		return workspace.activeOrganizationId;
	}
</script>

<svelte:head><title>Developers | Ratib</title></svelte:head>

<PageHeader
	eyebrow="PLATFORM ACCESS"
	title="Developers"
	description="Organization-scoped service accounts, event delivery, and request observability."
>
	{#snippet action()}<button
			class="button secondary"
			onclick={() => download('ratib-v1.openapi.yaml', openApi, 'application/yaml')}
			><Download size={15} /> OpenAPI</button
		><button
			class="button secondary"
			onclick={() => download('ratib.ts', typescriptSdk, 'text/typescript')}
			><Download size={15} /> TypeScript SDK</button
		><button
			class="button secondary"
			onclick={() => download('ratib.py', pythonSdk, 'text/x-python')}
			><Download size={15} /> Python SDK</button
		>{/snippet}
</PageHeader>

<div class="developer-tabs" role="tablist" aria-label="Developer settings">
	<button class:active={tab === 'accounts'} onclick={() => (tab = 'accounts')}
		><KeyRound size={15} /> Service accounts</button
	>
	<button class:active={tab === 'webhooks'} onclick={() => (tab = 'webhooks')}
		><Webhook size={15} /> Webhooks</button
	>
	<button class:active={tab === 'logs'} onclick={() => (tab = 'logs')}
		><Activity size={15} /> Request logs</button
	>
</div>

{#if error}<p class="form-error developer-alert" role="alert">{error}</p>{/if}
{#if notice}<p class="developer-notice"><Check size={15} /> {notice}</p>{/if}

{#if tab === 'accounts'}
	<section class="panel">
		<header>
			<div>
				<h2>Service accounts</h2>
				<p>Machine identities with explicit API and wallet boundaries.</p>
			</div>
			<button class="button primary" onclick={() => (showAccountForm = !showAccountForm)}
				><Plus size={15} /> Create</button
			>
		</header>
		{#if showAccountForm}
			<form class="developer-form" onsubmit={addAccount}>
				<label
					>Name<input
						bind:value={name}
						maxlength="80"
						required
						placeholder="Treasury integration"
					/></label
				>
				<label
					>Purpose<input
						bind:value={purpose}
						maxlength="180"
						required
						placeholder="Create approval-bound payouts"
					/></label
				>
				<fieldset>
					<legend>Scopes</legend>
					<div class="choice-grid">
						{#each DEVELOPER_API_SCOPES as scope}
							<label
								><input
									type="checkbox"
									checked={selectedScopes.includes(scope)}
									onchange={() => toggleScope(scope)}
								/>
								{scope}</label
							>
						{/each}
					</div>
				</fieldset>
				<fieldset>
					<legend>Wallet restrictions</legend>
					<div class="choice-grid">
						{#each wallets.data ?? [] as wallet}
							<label
								><input
									type="checkbox"
									checked={selectedWalletIds.includes(wallet._id)}
									onchange={() => toggleWallet(wallet._id)}
								/>
								{wallet.name}</label
							>
						{/each}
					</div>
				</fieldset>
				<div class="form-actions">
					<button type="button" class="button secondary" onclick={() => (showAccountForm = false)}
						>Cancel</button
					><button class="button primary" disabled={busy || !selectedScopes.length}
						>Generate credential</button
					>
				</div>
			</form>
		{/if}
		{#if accounts.isLoading}<div class="developer-empty">Loading service accounts...</div>
		{:else if accounts.error}<div class="developer-empty error">{accounts.error.message}</div>
		{:else if !accounts.data?.length}<div class="developer-empty">
				<KeyRound size={24} /><strong>No service accounts</strong>
			</div>
		{:else}<div class="account-list">
				{#each accounts.data as account}
					<article>
						<div class="account-title">
							<KeyRound size={18} />
							<div><strong>{account.name}</strong><small>{account.purpose}</small></div>
						</div>
						<StatusBadge status={account.status} />
						<div class="scope-list">
							{#each account.scopes as scope}<span>{scope}</span>{/each}
						</div>
						<div class="credential-list">
							{#each account.credentials as credential}
								<div>
									<code>{credential.keyId}</code><small
										>{credential.algorithm} · {credential.status}</small
									>{#if credential.status === 'active'}<button
											class="icon-button"
											title="Revoke credential"
											aria-label={`Revoke ${credential.keyId}`}
											disabled={busy}
											onclick={() =>
												act(
													() =>
														revokeCredential({
															organizationId: activeOrganizationId(),
															credentialId: credential._id
														}),
													'Unable to revoke credential.'
												)}><Ban size={14} /></button
										>{/if}
								</div>
							{/each}
						</div>
						{#if account.status === 'active'}<button
								class="button secondary danger"
								disabled={busy}
								onclick={() =>
									confirm(`Revoke ${account.name}?`) &&
									act(
										() =>
											revokeAccount({
												organizationId: activeOrganizationId(),
												serviceAccountId: account._id
											}),
										'Unable to revoke service account.'
									)}><Ban size={14} /> Revoke account</button
							>{/if}
					</article>
				{/each}
			</div>{/if}
	</section>
{:else if tab === 'webhooks'}
	<section class="panel">
		<header>
			<div>
				<h2>Webhook endpoints</h2>
				<p>Signed, at-least-once delivery of Ratib domain events.</p>
			</div>
			<button class="button primary" onclick={() => (showWebhookForm = !showWebhookForm)}
				><Plus size={15} /> Add endpoint</button
			>
		</header>
		{#if showWebhookForm}<form class="developer-form compact" onsubmit={addWebhook}>
				<label
					>HTTPS endpoint<input
						type="url"
						bind:value={webhookUrl}
						required
						placeholder="https://api.example.com/ratib-events"
					/></label
				>
				<div class="form-actions">
					<button type="button" class="button secondary" onclick={() => (showWebhookForm = false)}
						>Cancel</button
					><button class="button primary" disabled={busy}>Create endpoint</button>
				</div>
			</form>{/if}
		{#if webhooks.isLoading}<div class="developer-empty">Loading endpoints...</div>
		{:else if webhooks.error}<div class="developer-empty error">{webhooks.error.message}</div>
		{:else if !webhooks.data?.length}<div class="developer-empty">
				<Webhook size={24} /><strong>No webhook endpoints</strong>
			</div>
		{:else}<div class="webhook-list">
				{#each webhooks.data as endpoint}<article>
						<div>
							<strong>{endpoint.url}</strong><small>{endpoint.eventTypes.join(' · ')}</small>
						</div>
						<StatusBadge status={endpoint.status} />
						<div class="row-actions">
							<button
								class="icon-button"
								title="Send test event"
								aria-label="Send test event"
								disabled={busy || endpoint.status !== 'active'}
								onclick={() =>
									act(
										() =>
											sendWebhookTest({
												organizationId: activeOrganizationId(),
												endpointId: endpoint._id
											}),
										'Unable to send test event.'
									)}><Send size={14} /></button
							>
							<button
								class="icon-button"
								title={endpoint.status === 'active' ? 'Pause endpoint' : 'Activate endpoint'}
								aria-label={endpoint.status === 'active' ? 'Pause endpoint' : 'Activate endpoint'}
								disabled={busy || endpoint.status === 'revoked'}
								onclick={() =>
									act(
										() =>
											setWebhookStatus({
												organizationId: activeOrganizationId(),
												endpointId: endpoint._id,
												status: endpoint.status === 'active' ? 'paused' : 'active'
											}),
										'Unable to update endpoint.'
									)}><ShieldCheck size={14} /></button
							>
						</div>
						{#if endpoint.deliveries.length}<div class="deliveries">
								{#each endpoint.deliveries as delivery}<div>
										<code>{delivery.deliveryKey}</code><span>{delivery.status}</span
										>{#if delivery.status === 'failed'}<button
												class="icon-button"
												title="Replay delivery"
												aria-label="Replay delivery"
												disabled={busy}
												onclick={() =>
													act(
														() =>
															replayDelivery({
																organizationId: activeOrganizationId(),
																deliveryId: delivery._id
															}),
														'Unable to replay delivery.'
													)}><RefreshCw size={13} /></button
											>{/if}
									</div>{/each}
							</div>{/if}
					</article>{/each}
			</div>{/if}
	</section>
{:else}
	<section class="panel">
		<header>
			<div>
				<h2>Request logs</h2>
				<p>Sanitized metadata for API request correlation.</p>
			</div>
			<Activity size={19} />
		</header>
		{#if requestLogs.isLoading}<div class="developer-empty">Loading request logs...</div>
		{:else if requestLogs.error}<div class="developer-empty error">{requestLogs.error.message}</div>
		{:else if !requestLogs.data?.length}<div class="developer-empty">
				<Activity size={24} /><strong>No API requests</strong>
			</div>
		{:else}<div class="table-wrap">
				<table>
					<thead
						><tr><th>Time</th><th>Request</th><th>Route</th><th>Status</th><th>Latency</th></tr
						></thead
					><tbody
						>{#each requestLogs.data as item}<tr
								><td>{new Date(item.createdAt).toLocaleString()}</td><td
									><code>{item.requestId}</code></td
								><td><strong>{item.method}</strong> <code>{item.route}</code></td><td
									>{item.status}{#if item.errorCode}<small>{item.errorCode}</small>{/if}</td
								><td>{item.durationMs} ms</td></tr
							>{/each}</tbody
					>
				</table>
			</div>{/if}
	</section>
{/if}

<style>
	.developer-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 14px;
		border-bottom: 1px solid #dbe2e1;
	}
	.developer-tabs button {
		display: flex;
		gap: 7px;
		align-items: center;
		border: 0;
		border-bottom: 2px solid transparent;
		padding: 10px 13px;
		color: #66777d;
		background: transparent;
		font-size: 0.68rem;
	}
	.developer-tabs button.active {
		border-color: #286d5c;
		color: #286d5c;
		font-weight: 700;
	}
	.developer-alert,
	.developer-notice {
		margin: 0 0 12px;
	}
	.developer-notice {
		display: flex;
		gap: 7px;
		align-items: center;
		border: 1px solid #bfdbd1;
		padding: 10px 12px;
		color: #286d5c;
		background: #f3f9f6;
		font-size: 0.68rem;
	}
	.developer-form {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
		border-bottom: 1px solid #e2e7e6;
		padding: 18px;
		background: #fafcfc;
	}
	.developer-form.compact {
		grid-template-columns: 1fr auto;
		align-items: end;
	}
	.developer-form label,
	.developer-form fieldset {
		display: grid;
		gap: 6px;
		color: #516167;
		font-size: 0.65rem;
		font-weight: 700;
	}
	.developer-form input {
		min-height: 39px;
		border: 1px solid #ccd6d4;
		padding: 0 10px;
		background: white;
	}
	.developer-form fieldset {
		grid-column: 1 / -1;
		border: 0;
		margin: 0;
		padding: 0;
	}
	.choice-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 7px;
	}
	.choice-grid label {
		display: flex;
		align-items: center;
		border: 1px solid #dce3e1;
		padding: 9px;
		background: white;
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
	}
	.form-actions {
		display: flex;
		grid-column: 1 / -1;
		justify-content: flex-end;
		gap: 7px;
	}
	.account-list,
	.webhook-list {
		display: grid;
	}
	.account-list article,
	.webhook-list article {
		display: grid;
		grid-template-columns: minmax(180px, 1fr) auto;
		gap: 12px;
		border-bottom: 1px solid #e4e9e8;
		padding: 16px 18px;
	}
	.account-title {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	.account-title div,
	.webhook-list article > div:first-child {
		display: grid;
		gap: 3px;
		min-width: 0;
	}
	.account-title small,
	.webhook-list small {
		color: #7a898e;
		font-size: 0.6rem;
		overflow-wrap: anywhere;
	}
	.scope-list {
		display: flex;
		grid-column: 1 / -1;
		flex-wrap: wrap;
		gap: 5px;
	}
	.scope-list span {
		border: 1px solid #d6e1de;
		padding: 4px 6px;
		color: #45645b;
		background: #f6faf8;
		font-family: ui-monospace, monospace;
		font-size: 0.55rem;
	}
	.credential-list,
	.deliveries {
		display: grid;
		grid-column: 1 / -1;
		gap: 5px;
	}
	.credential-list > div,
	.deliveries > div {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 8px;
		border: 1px solid #e1e6e5;
		padding: 8px;
	}
	.credential-list small,
	.deliveries span {
		color: #79868a;
		font-size: 0.58rem;
	}
	.account-list .danger {
		justify-self: start;
	}
	.row-actions {
		display: flex;
		gap: 5px;
	}
	.developer-empty {
		display: grid;
		min-height: 210px;
		place-items: center;
		align-content: center;
		gap: 7px;
		color: #77858a;
		font-size: 0.7rem;
	}
	.developer-empty.error {
		color: #9b4039;
	}
	td small {
		display: block;
		color: #9b4039;
		font-size: 0.55rem;
	}
	@media (max-width: 760px) {
		.developer-tabs {
			overflow-x: auto;
		}
		.developer-tabs button {
			white-space: nowrap;
		}
		.developer-form,
		.developer-form.compact,
		.choice-grid {
			grid-template-columns: 1fr;
		}
		.account-list article,
		.webhook-list article {
			grid-template-columns: 1fr auto;
		}
	}
</style>
