<script lang="ts">
	import {
		Building2,
		CheckCircle2,
		Database,
		FileText,
		KeyRound,
		PlugZap,
		RefreshCw,
		Search,
		ShieldCheck,
		Unplug
	} from '@lucide/svelte';
	import { useAction, useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const connections = useQuery(api.erpnext.listConnections, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const testConnection = useAction(api.erpnextActions.testConnection);
	const saveConnection = useAction(api.erpnextActions.saveConnection);
	const syncChartOfAccounts = useAction(api.erpnextActions.syncChartOfAccounts);
	const syncReferenceData = useAction(api.erpnextActions.syncReferenceData);
	const syncTransient = useAction(api.erpnextActions.syncTransient);
	const pushDraftDocument = useAction(api.erpnextActions.pushDraftDocument);
	const pushSettlement = useAction(api.erpnextActions.pushSettlement);
	const disconnectConnection = useAction(api.erpnextActions.disconnect);
	const configureConnection = useMutation(api.erpnext.configureConnection);
	const setAccountMapping = useMutation(api.erpnext.setMapping);

	let credentialMode = $state<'transient' | 'saved'>('saved');
	let label = $state('Finance ERP');
	let baseUrl = $state('');
	let apiKey = $state('');
	let apiSecret = $state('');
	let transientCompanies = $state<string[]>([]);
	let transientCompany = $state('');
	let selectedConnectionId = $state<Id<'erpConnections'> | null>(null);
	let accountSearch = $state('');
	let detailTab = $state<
		'accounts' | 'masters' | 'bills' | 'receivables' | 'mappings' | 'exports' | 'settlements'
	>('accounts');
	let selectedCompany = $state('');
	let autoSyncEnabled = $state(false);
	let autoSyncIntervalMinutes = $state(60);
	let mappingExternalAccountId = $state<Id<'erpExternalAccounts'> | null>(null);
	let mappingChartAccountId = $state<Id<'chartAccounts'> | null>(null);
	let settlementSourceKey = $state('');
	let settlementDocumentId = $state<Id<'erpExternalDocuments'> | null>(null);
	let settlementBankAccountId = $state<Id<'erpExternalAccounts'> | null>(null);
	let exportSourceKey = $state('');
	let exportPartyId = $state<Id<'erpReferenceData'> | null>(null);
	let exportItemId = $state<Id<'erpReferenceData'> | null>(null);
	let exportAccountId = $state<Id<'erpExternalAccounts'> | null>(null);
	let busy = $state<
		| 'test'
		| 'save'
		| 'sync'
		| 'transientSync'
		| 'configure'
		| 'mapping'
		| 'export'
		| 'settlement'
		| 'disconnect'
		| null
	>(null);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	const accounts = useQuery(api.erpnext.listAccounts, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? {
					organizationId: workspace.activeOrganizationId,
					connectionId: selectedConnectionId
				}
			: 'skip'
	);
	const runs = useQuery(api.erpnext.listRuns, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? {
					organizationId: workspace.activeOrganizationId,
					connectionId: selectedConnectionId
				}
			: 'skip'
	);
	const purchaseDocuments = useQuery(api.erpnext.listDocuments, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? {
					organizationId: workspace.activeOrganizationId,
					connectionId: selectedConnectionId,
					documentType: 'purchaseInvoice' as const
				}
			: 'skip'
	);
	const salesDocuments = useQuery(api.erpnext.listDocuments, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? {
					organizationId: workspace.activeOrganizationId,
					connectionId: selectedConnectionId,
					documentType: 'salesInvoice' as const
				}
			: 'skip'
	);
	const mappings = useQuery(api.erpnext.listMappings, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? { organizationId: workspace.activeOrganizationId, connectionId: selectedConnectionId }
			: 'skip'
	);
	const referenceData = useQuery(api.erpnext.listReferenceData, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? { organizationId: workspace.activeOrganizationId, connectionId: selectedConnectionId }
			: 'skip'
	);
	const exportSources = useQuery(api.erpnext.listExportSources, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const documentPushRuns = useQuery(api.erpnext.listDocumentPushRuns, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? { organizationId: workspace.activeOrganizationId, connectionId: selectedConnectionId }
			: 'skip'
	);
	const settlementSources = useQuery(api.erpnext.listSettlementSources, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const settlementRuns = useQuery(api.erpnext.listSettlementRuns, () =>
		workspace.activeOrganizationId && selectedConnectionId
			? { organizationId: workspace.activeOrganizationId, connectionId: selectedConnectionId }
			: 'skip'
	);
	const accounting = useQuery(api.accounting.workspace, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);

	let selectedConnection = $derived(
		(connections.data ?? []).find((connection) => connection._id === selectedConnectionId)
	);
	let visibleAccounts = $derived.by(() => {
		const needle = accountSearch.trim().toLowerCase();
		if (!needle) return accounts.data ?? [];
		return (accounts.data ?? []).filter((account) =>
			[
				account.accountName,
				account.accountNumber,
				account.rootType,
				account.accountType,
				account.company,
				account.accountCurrency
			]
				.filter(Boolean)
				.some((value) => value!.toLowerCase().includes(needle))
		);
	});
	let selectedSettlementSource = $derived(
		(settlementSources.data ?? []).find(
			(source) => `${source.sourceType}:${source.sourceId}` === settlementSourceKey
		)
	);
	let eligibleSettlementDocuments = $derived(
		selectedSettlementSource?.direction === 'pay'
			? (purchaseDocuments.data ?? [])
			: selectedSettlementSource?.direction === 'receive'
				? (salesDocuments.data ?? [])
				: []
	);
	let visibleDocuments = $derived(
		detailTab === 'bills' ? (purchaseDocuments.data ?? []) : (salesDocuments.data ?? [])
	);
	let selectedExportSource = $derived(
		(exportSources.data ?? []).find(
			(source) => `${source.sourceType}:${source.sourceId}` === exportSourceKey
		)
	);
	let exportParties = $derived(
		(referenceData.data ?? []).filter(
			(reference) =>
				!reference.disabled &&
				reference.referenceType ===
					(selectedExportSource?.sourceType === 'payable' ? 'supplier' : 'customer')
		)
	);

	$effect(() => {
		const available = connections.data ?? [];
		if (available.length === 0) selectedConnectionId = null;
		else if (!selectedConnectionId || !available.some((item) => item._id === selectedConnectionId))
			selectedConnectionId = available[0]._id;
	});

	$effect(() => {
		if (!selectedConnection) return;
		selectedCompany = selectedConnection.selectedCompany ?? '';
		autoSyncEnabled = selectedConnection.autoSyncEnabled;
		autoSyncIntervalMinutes = selectedConnection.autoSyncIntervalMinutes ?? 60;
	});

	function userError(caught: unknown, fallback: string) {
		if (!(caught instanceof Error)) return fallback;
		return (
			caught.message.match(/Uncaught Error:\s*(.*?)(?=\s+at\s+(?:async\s+)?[\w$]+\s*\(|$)/s)?.[1] ??
			caught.message
		);
	}

	function resetFeedback() {
		error = null;
		success = null;
	}

	function clearCredentialFields() {
		apiKey = '';
		apiSecret = '';
	}

	async function testOnce() {
		if (!workspace.activeOrganizationId) return;
		busy = 'test';
		resetFeedback();
		try {
			const result = await testConnection({
				organizationId: workspace.activeOrganizationId,
				baseUrl,
				apiKey,
				apiSecret
			});
			transientCompanies = result.connection.companies;
			transientCompany =
				result.connection.companies.length === 1 ? result.connection.companies[0] : '';
			success = `Connection test passed as ${result.connection.remoteUser} on ${result.connection.remoteSiteName}. Select a company to run a foreground sync; background sync remains unavailable.`;
		} catch (caught) {
			error = userError(caught, 'ERPNext connection test failed.');
			clearCredentialFields();
			transientCompanies = [];
			transientCompany = '';
		} finally {
			busy = null;
		}
	}

	async function syncTransientNow() {
		if (!workspace.activeOrganizationId || !transientCompany) return;
		busy = 'transientSync';
		resetFeedback();
		try {
			const result = await syncTransient({
				organizationId: workspace.activeOrganizationId,
				baseUrl,
				apiKey,
				apiSecret,
				selectedCompany: transientCompany,
				requestKey: crypto.randomUUID().replaceAll('-', '_')
			});
			selectedConnectionId = result.connectionId;
			success = `Foreground sync completed: ${result.accounts} accounts, ${result.references} references, ${result.purchaseInvoices} bills, and ${result.salesInvoices} receivables. Credentials were not saved.`;
		} catch (caught) {
			error = userError(caught, 'ERPNext foreground sync failed.');
		} finally {
			clearCredentialFields();
			transientCompanies = [];
			transientCompany = '';
			busy = null;
		}
	}

	async function save() {
		if (!workspace.activeOrganizationId) return;
		busy = 'save';
		resetFeedback();
		try {
			const result = await saveConnection({
				organizationId: workspace.activeOrganizationId,
				label,
				baseUrl,
				apiKey,
				apiSecret
			});
			selectedConnectionId = result.connectionId;
			success = `Saved ${result.connection.remoteSiteName}. Chart sync is now available.`;
			clearCredentialFields();
		} catch (caught) {
			error = userError(caught, 'Unable to save the ERPNext connection.');
		} finally {
			busy = null;
		}
	}

	async function syncAccounts(connectionId: Id<'erpConnections'>) {
		if (!workspace.activeOrganizationId) return;
		busy = 'sync';
		resetFeedback();
		selectedConnectionId = connectionId;
		try {
			const result = await syncChartOfAccounts({
				organizationId: workspace.activeOrganizationId,
				connectionId,
				requestKey: crypto.randomUUID().replaceAll('-', '_')
			});
			success = result.deduplicated
				? `This sync request was already ${result.status}.`
				: `${result.itemCount ?? 0} ERPNext accounts synced.`;
		} catch (caught) {
			error = userError(caught, 'ERPNext account sync failed.');
		} finally {
			busy = null;
		}
	}

	async function syncDocuments(kind: 'masterData' | 'openPurchaseInvoices' | 'openSalesInvoices') {
		if (!workspace.activeOrganizationId || !selectedConnectionId) return;
		busy = 'sync';
		resetFeedback();
		try {
			const result = await syncReferenceData({
				organizationId: workspace.activeOrganizationId,
				connectionId: selectedConnectionId,
				requestKey: crypto.randomUUID().replaceAll('-', '_'),
				kind
			});
			success =
				kind === 'masterData'
					? `${result.itemCount ?? 0} ERPNext reference records synced.`
					: `${result.itemCount ?? 0} open ${kind === 'openPurchaseInvoices' ? 'purchase' : 'sales'} invoices synced.`;
		} catch (caught) {
			error = userError(caught, 'ERPNext invoice sync failed.');
		} finally {
			busy = null;
		}
	}

	async function exportDraft() {
		if (
			!workspace.activeOrganizationId ||
			!selectedConnectionId ||
			!selectedExportSource ||
			!exportPartyId ||
			!exportItemId ||
			!exportAccountId
		)
			return;
		busy = 'export';
		resetFeedback();
		try {
			const result = await pushDraftDocument({
				organizationId: workspace.activeOrganizationId,
				connectionId: selectedConnectionId,
				sourceType: selectedExportSource.sourceType,
				sourceId: selectedExportSource.sourceId,
				partyReferenceId: exportPartyId,
				itemReferenceId: exportItemId,
				externalAccountId: exportAccountId
			});
			success = result.deduplicated
				? `ERPNext draft already ${result.status}.`
				: `ERPNext draft ${result.providerDocumentId ?? ''} created for review.`;
		} catch (caught) {
			error = userError(caught, 'ERPNext draft export failed.');
		} finally {
			busy = null;
		}
	}

	async function saveConfiguration() {
		if (!workspace.activeOrganizationId || !selectedConnectionId) return;
		busy = 'configure';
		resetFeedback();
		try {
			await configureConnection({
				organizationId: workspace.activeOrganizationId,
				connectionId: selectedConnectionId,
				selectedCompany,
				autoSyncEnabled,
				autoSyncIntervalMinutes: autoSyncEnabled ? autoSyncIntervalMinutes : undefined
			});
			success = 'ERPNext company and sync schedule saved.';
		} catch (caught) {
			error = userError(caught, 'Unable to configure this ERPNext connection.');
		} finally {
			busy = null;
		}
	}

	async function saveMapping() {
		if (
			!workspace.activeOrganizationId ||
			!selectedConnectionId ||
			!mappingExternalAccountId ||
			!mappingChartAccountId
		)
			return;
		busy = 'mapping';
		resetFeedback();
		try {
			await setAccountMapping({
				organizationId: workspace.activeOrganizationId,
				connectionId: selectedConnectionId,
				externalAccountId: mappingExternalAccountId,
				chartAccountId: mappingChartAccountId,
				status: 'active'
			});
			success = 'Account mapping saved.';
		} catch (caught) {
			error = userError(caught, 'Unable to save the account mapping.');
		} finally {
			busy = null;
		}
	}

	async function postSettlement() {
		if (
			!workspace.activeOrganizationId ||
			!selectedConnectionId ||
			!selectedSettlementSource ||
			!settlementDocumentId ||
			!settlementBankAccountId
		)
			return;
		busy = 'settlement';
		resetFeedback();
		try {
			const result = await pushSettlement({
				organizationId: workspace.activeOrganizationId,
				connectionId: selectedConnectionId,
				sourceType: selectedSettlementSource.sourceType,
				sourceId: selectedSettlementSource.sourceId,
				externalDocumentId: settlementDocumentId,
				bankExternalAccountId: settlementBankAccountId
			});
			success = result.deduplicated
				? `ERPNext settlement already ${result.status}.`
				: `ERPNext Payment Entry ${result.providerDocumentId ?? ''} submitted.`;
		} catch (caught) {
			error = userError(caught, 'ERPNext settlement posting failed.');
		} finally {
			busy = null;
		}
	}

	async function disconnect(connectionId: Id<'erpConnections'>) {
		if (
			!workspace.activeOrganizationId ||
			!confirm('Disable this ERPNext connection and permanently remove its saved credentials?')
		)
			return;
		busy = 'disconnect';
		resetFeedback();
		try {
			await disconnectConnection({
				organizationId: workspace.activeOrganizationId,
				connectionId
			});
			success = 'ERPNext connection disabled and saved credentials removed.';
		} catch (caught) {
			error = userError(caught, 'Unable to disable the ERPNext connection.');
		} finally {
			busy = null;
		}
	}

	function formatDate(value?: number) {
		return value
			? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
					value
				)
			: 'Never';
	}
</script>

<svelte:head><title>Integrations | Ratib</title></svelte:head>

<PageHeader
	eyebrow="FINANCE SYSTEMS"
	title="Integrations"
	description="Connect Ratib to an ERP and keep imported finance reference data current."
/>

{#if error}<div class="notice error" role="alert">{error}</div>{/if}
{#if success}<div class="notice success" role="status">
		<CheckCircle2 size={16} />
		{success}
	</div>{/if}

<div class="integration-layout">
	<section class="connect-panel" aria-labelledby="connect-title">
		<header>
			<div class="provider-mark"><PlugZap size={19} /></div>
			<div>
				<h2 id="connect-title">Connect ERPNext</h2>
				<p>Use an ERPNext API key issued to a least-privilege integration user.</p>
			</div>
		</header>

		<label class="credential-choice">
			<input
				type="checkbox"
				checked={credentialMode === 'saved'}
				onchange={(event) => (credentialMode = event.currentTarget.checked ? 'saved' : 'transient')}
			/>
			<span
				><strong>Save credential in Ratib</strong><small
					>Required for background synchronization.</small
				></span
			>
		</label>

		<div class="mode-note">
			{#if credentialMode === 'saved'}
				<span class="mode-icon"><ShieldCheck size={17} /></span>
				<span
					><strong>Prototype credential storage.</strong> Use a dedicated, least-privilege ERPNext integration
					user. The secret is encrypted before it is stored in Convex and is only decrypted inside server
					actions.</span
				>
			{:else}
				<span class="mode-icon"><KeyRound size={17} /></span>
				<span
					>Credentials stay only in this form and the active server action. Test the connection,
					select a company, then run Sync now; Ratib clears them after the foreground sync and
					cannot schedule background sync.</span
				>
			{/if}
		</div>

		<form
			onsubmit={(event) => {
				event.preventDefault();
				void (credentialMode === 'saved' ? save() : testOnce());
			}}
		>
			{#if credentialMode === 'saved'}
				<label>
					<span>Connection name</span>
					<input bind:value={label} maxlength="80" autocomplete="off" required />
				</label>
			{/if}
			<label>
				<span>ERPNext URL</span>
				<input
					bind:value={baseUrl}
					type="url"
					placeholder="https://finance.example.com"
					autocomplete="url"
					required
				/>
			</label>
			<div class="field-grid">
				<label>
					<span>API key</span>
					<input bind:value={apiKey} autocomplete="off" spellcheck="false" required />
				</label>
				<label>
					<span>API secret</span>
					<input bind:value={apiSecret} type="password" autocomplete="new-password" required />
				</label>
			</div>
			<button class="button primary submit" type="submit" disabled={busy !== null}>
				{#if busy === 'save' || busy === 'test'}<span class="spin"><RefreshCw size={15} /></span
					>{:else if credentialMode === 'saved'}<Database size={15} />{:else}<PlugZap
						size={15}
					/>{/if}
				{busy === 'save'
					? 'Verifying and saving…'
					: busy === 'test'
						? 'Testing…'
						: credentialMode === 'saved'
							? 'Verify and save'
							: 'Test connection'}
			</button>
			{#if credentialMode === 'transient' && transientCompanies.length > 0}
				<label>
					<span>Company to sync</span>
					<select bind:value={transientCompany} required>
						<option value="">Select company</option>
						{#each transientCompanies as company}<option value={company}>{company}</option>{/each}
					</select>
				</label>
				<button
					class="button secondary submit"
					type="button"
					disabled={!transientCompany || busy !== null}
					onclick={syncTransientNow}
				>
					<span class:spin={busy === 'transientSync'}><RefreshCw size={15} /></span>
					{busy === 'transientSync' ? 'Syncing without saving…' : 'Sync now without saving'}
				</button>
			{/if}
		</form>
	</section>

	<section class="connections-panel" aria-labelledby="connections-title">
		<header>
			<div>
				<h2 id="connections-title">Saved connections</h2>
				<p>Organization-scoped credentials and account imports.</p>
			</div>
			<span class="count">{connections.data?.length ?? 0}</span>
		</header>
		{#if connections.isLoading}
			<div class="empty">Loading connections…</div>
		{:else if connections.error}
			<div class="empty error" role="alert">{connections.error.message}</div>
		{:else if connections.data?.length === 0}
			<div class="empty">
				<PlugZap size={24} />
				<strong>No saved connections</strong>
				<span>Verify and save an ERPNext site to enable account syncing.</span>
			</div>
		{:else}
			<div class="connection-list">
				{#each connections.data ?? [] as connection}
					<article class:selected={connection._id === selectedConnectionId}>
						<button
							class="connection-main"
							type="button"
							onclick={() => (selectedConnectionId = connection._id)}
						>
							<span class="provider-icon"><Building2 size={17} /></span>
							<span class="connection-copy">
								<span class="name-row"
									><strong>{connection.label}</strong><StatusBadge
										status={connection.status}
									/></span
								>
								<span>{connection.remoteSiteName ?? connection.baseUrl}</span>
								<small
									>{connection.remoteUser ?? 'Unverified user'} · key {connection.apiKeyHint}</small
								>
							</span>
						</button>
						<div class="connection-actions">
							<button
								class="icon-action"
								type="button"
								title="Sync chart of accounts"
								aria-label={`Sync ${connection.label} chart of accounts`}
								disabled={connection.status === 'disabled' || busy !== null}
								onclick={() => syncAccounts(connection._id)}
								><span class:spin={busy === 'sync' && selectedConnectionId === connection._id}
									><RefreshCw size={16} /></span
								></button
							>
							<button
								class="icon-action danger"
								type="button"
								title="Disable connection"
								aria-label={`Disable ${connection.label}`}
								disabled={connection.status === 'disabled' || busy !== null}
								onclick={() => disconnect(connection._id)}><Unplug size={16} /></button
							>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</div>

{#if selectedConnection}
	<section class="detail-panel" aria-labelledby="accounts-title">
		<header class="detail-header">
			<div>
				<span class="eyebrow">ERP REFERENCE DATA</span>
				<h2 id="accounts-title">{selectedConnection.label}</h2>
				<p>
					Last verified {formatDate(selectedConnection.lastVerifiedAt)} · Last synced {formatDate(
						selectedConnection.lastSyncAt
					)}
				</p>
			</div>
			<div class="detail-actions">
				{#if detailTab === 'accounts'}<label class="search-box">
						<Search size={15} />
						<span class="sr-only">Search imported accounts</span>
						<input bind:value={accountSearch} placeholder="Search accounts" />
					</label>{/if}
				<button
					class="button secondary"
					disabled={selectedConnection.status === 'disabled' ||
						selectedConnection.credentialMode === 'transient' ||
						busy !== null}
					onclick={() =>
						detailTab === 'bills'
							? syncDocuments('openPurchaseInvoices')
							: detailTab === 'receivables'
								? syncDocuments('openSalesInvoices')
								: detailTab === 'masters'
									? syncDocuments('masterData')
									: syncAccounts(selectedConnection!._id)}
					><span class:spin={busy === 'sync'}><RefreshCw size={15} /></span> Sync {detailTab ===
					'bills'
						? 'bills'
						: detailTab === 'receivables'
							? 'receivables'
							: detailTab === 'masters'
								? 'reference data'
								: 'accounts'}</button
				>
			</div>
		</header>

		{#if selectedConnection.status === 'disabled'}
			<div class="state-banner disabled">
				<Unplug size={17} /> Credentials removed. Reconnect this URL to sync again.
			</div>
		{:else if selectedConnection.status === 'error'}
			<div class="state-banner error">
				<KeyRound size={17} /> Sync needs attention{selectedConnection.lastErrorCode
					? ` (${selectedConnection.lastErrorCode})`
					: ''}. Reauthorize the connection above.
			</div>
		{/if}

		{#if selectedConnection.credentialMode === 'transient'}
			<div class="state-banner disabled">
				<KeyRound size={17} /> Foreground snapshot only. Enter credentials above to refresh it; no credential
				or schedule was saved.
			</div>
		{/if}

		<div class="configuration-strip">
			<label
				><span>Company</span><select bind:value={selectedCompany} disabled={busy !== null}>
					<option value="">Select company</option>
					{#each selectedConnection.availableCompanies ?? [] as company}<option value={company}
							>{company}</option
						>{/each}
				</select></label
			>
			<label class="toggle-field"
				><input
					type="checkbox"
					bind:checked={autoSyncEnabled}
					disabled={!selectedCompany ||
						selectedConnection.credentialMode === 'transient' ||
						busy !== null}
				/><span>Automatic sync</span></label
			>
			{#if autoSyncEnabled}<label
					><span>Every</span><select bind:value={autoSyncIntervalMinutes}
						><option value={15}>15 minutes</option><option value={60}>1 hour</option><option
							value={360}>6 hours</option
						><option value={1440}>24 hours</option></select
					></label
				>{/if}
			<button
				class="button secondary"
				disabled={!selectedCompany ||
					selectedConnection.credentialMode === 'transient' ||
					busy !== null}
				onclick={saveConfiguration}>{busy === 'configure' ? 'Saving…' : 'Save settings'}</button
			>
		</div>

		<nav class="detail-tabs" aria-label="ERPNext data">
			<button class:active={detailTab === 'accounts'} onclick={() => (detailTab = 'accounts')}
				>Accounts</button
			>
			<button class:active={detailTab === 'masters'} onclick={() => (detailTab = 'masters')}
				>Reference data</button
			>
			<button class:active={detailTab === 'bills'} onclick={() => (detailTab = 'bills')}
				>Open bills</button
			>
			<button class:active={detailTab === 'receivables'} onclick={() => (detailTab = 'receivables')}
				>Receivables</button
			>
			<button class:active={detailTab === 'mappings'} onclick={() => (detailTab = 'mappings')}
				>Mappings</button
			>
			<button class:active={detailTab === 'exports'} onclick={() => (detailTab = 'exports')}
				>Draft exports</button
			>
			<button class:active={detailTab === 'settlements'} onclick={() => (detailTab = 'settlements')}
				>Settlements</button
			>
		</nav>

		<div class="details-grid">
			<div class="accounts-region">
				{#if detailTab === 'accounts'}
					{#if accounts.isLoading}
						<div class="empty table-empty">Loading imported accounts…</div>
					{:else if accounts.error}
						<div class="empty table-empty error" role="alert">{accounts.error.message}</div>
					{:else if accounts.data?.length === 0}
						<div class="empty table-empty">
							<Database size={24} />
							<strong>No imported accounts</strong>
							<span>Run the first chart-of-accounts sync for this connection.</span>
						</div>
					{:else}
						<div class="table-wrap">
							<table>
								<thead
									><tr
										><th>Account</th><th>Type</th><th>Company</th><th>Currency</th><th>Status</th
										></tr
									></thead
								>
								<tbody>
									{#each visibleAccounts as account}
										<tr>
											<td
												><strong>{account.accountName}</strong><small
													>{account.accountNumber ?? account.providerAccountId}</small
												></td
											>
											<td
												>{account.accountType ??
													account.rootType ??
													'Unclassified'}{#if account.isGroup}<small>Group</small>{/if}</td
											>
											<td>{account.company ?? '—'}</td>
											<td class="mono">{account.accountCurrency ?? '—'}</td>
											<td><StatusBadge status={account.disabled ? 'disabled' : 'active'} /></td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						{#if visibleAccounts.length === 0}<div class="filter-empty">
								No accounts match “{accountSearch}”.
							</div>{/if}
					{/if}
				{:else if detailTab === 'masters'}
					{#if referenceData.isLoading}<div class="empty table-empty">Loading reference data…</div>
					{:else if referenceData.data?.length === 0}<div class="empty table-empty">
							<Database size={24} /><strong>No ERPNext reference data</strong><span
								>Sync suppliers, customers, cost centers, currencies, employees, and items.</span
							>
						</div>
					{:else}<div class="table-wrap">
							<table>
								<thead><tr><th>Type</th><th>Name</th><th>Company</th><th>Status</th></tr></thead>
								<tbody
									>{#each referenceData.data ?? [] as reference}<tr>
											<td>{reference.referenceType}</td><td
												><strong>{reference.displayName}</strong><small
													>{reference.providerReferenceId}</small
												></td
											><td>{reference.company ?? 'Global'}</td><td
												><StatusBadge status={reference.disabled ? 'disabled' : 'active'} /></td
											>
										</tr>{/each}</tbody
								>
							</table>
						</div>{/if}
				{:else if detailTab === 'bills' || detailTab === 'receivables'}
					{#if !selectedCompany}<div class="empty table-empty">
							<Building2 size={24} /><strong>Select an ERPNext company</strong><span
								>Company scope is required before invoices can be imported.</span
							>
						</div>
					{:else if (detailTab === 'bills' ? purchaseDocuments : salesDocuments).isLoading}<div
							class="empty table-empty"
						>
							Loading ERPNext documents…
						</div>
					{:else if (detailTab === 'bills' ? purchaseDocuments : salesDocuments).error}<div
							class="empty table-empty error"
							role="alert"
						>
							{(detailTab === 'bills' ? purchaseDocuments : salesDocuments).error?.message}
						</div>
					{:else if visibleDocuments.length === 0}<div class="empty table-empty">
							<FileText size={24} /><strong
								>No open {detailTab === 'bills' ? 'purchase' : 'sales'} invoices</strong
							><span>Sync this view to refresh ERPNext outstanding documents.</span>
						</div>
					{:else}<div class="table-wrap">
							<table>
								<thead
									><tr
										><th>Document</th><th>Party</th><th>Due</th><th>Outstanding</th><th>Status</th
										></tr
									></thead
								><tbody
									>{#each visibleDocuments as document}<tr
											><td
												><strong>{document.providerDocumentId}</strong><small
													>{document.company}</small
												></td
											><td>{document.partyName ?? document.party ?? '—'}</td><td
												>{document.dueDate ?? '—'}</td
											><td class="mono">{document.outstandingAmount} {document.currency}</td><td
												><StatusBadge status={document.status} /></td
											></tr
										>{/each}</tbody
								>
							</table>
						</div>{/if}
				{:else if detailTab === 'mappings'}
					<div class="workflow-form">
						<h3>Account mapping</h3>
						<p>Map active ERPNext posting accounts to Ratib’s controlled chart.</p>
						<div class="field-grid">
							<label
								><span>ERPNext account</span><select bind:value={mappingExternalAccountId}
									><option value={null}>Select account</option
									>{#each (accounts.data ?? []).filter((account) => !account.isGroup && !account.disabled) as account}<option
											value={account._id}
											>{account.accountName} · {account.accountNumber ??
												account.providerAccountId}</option
										>{/each}</select
								></label
							><label
								><span>Ratib account</span><select bind:value={mappingChartAccountId}
									><option value={null}>Select account</option
									>{#each (accounting.data?.accounts ?? []).filter((account: { isPosting: boolean; active: boolean }) => account.isPosting && account.active) as account}<option
											value={account._id}>{account.code} · {account.name}</option
										>{/each}</select
								></label
							>
						</div>
						<button
							class="button primary"
							disabled={!mappingExternalAccountId || !mappingChartAccountId || busy !== null}
							onclick={saveMapping}>{busy === 'mapping' ? 'Saving…' : 'Save mapping'}</button
						>
					</div>
					{#if mappings.data?.length}<div class="mapping-list">
							{#each mappings.data as mapping}<div>
									<span><strong>{mapping.externalAccountName}</strong><small>ERPNext</small></span
									><span class="mapping-arrow">→</span><span
										><strong>{mapping.chartAccountCode} · {mapping.chartAccountName}</strong><small
											>Ratib</small
										></span
									><StatusBadge status={mapping.status} />
								</div>{/each}
						</div>{/if}
				{:else if detailTab === 'exports'}
					<div class="workflow-form">
						<h3>Create an ERPNext draft</h3>
						<p>
							Export a Ratib bill or invoice for ERPNext review. Ratib never submits it
							automatically.
						</p>
						<label
							><span>Ratib document</span><select
								bind:value={exportSourceKey}
								onchange={() => (exportPartyId = null)}
							>
								<option value="">Select a bill or invoice</option>
								{#each exportSources.data ?? [] as source}<option
										value={`${source.sourceType}:${source.sourceId}`}
										>{source.label} · {source.counterparty} · {source.amount} USDC</option
									>{/each}
							</select></label
						>
						<div class="field-grid">
							<label
								><span
									>{selectedExportSource?.sourceType === 'payable' ? 'Supplier' : 'Customer'}</span
								><select bind:value={exportPartyId} disabled={!selectedExportSource}>
									<option value={null}>Select party</option>{#each exportParties as party}<option
											value={party._id}>{party.displayName}</option
										>{/each}
								</select></label
							>
							<label
								><span>ERPNext item</span><select bind:value={exportItemId}>
									<option value={null}>Select item</option
									>{#each (referenceData.data ?? []).filter((reference) => reference.referenceType === 'item' && !reference.disabled) as item}<option
											value={item._id}>{item.displayName}</option
										>{/each}
								</select></label
							>
							<label
								><span
									>{selectedExportSource?.sourceType === 'payable' ? 'Expense' : 'Income'} account</span
								><select bind:value={exportAccountId}>
									<option value={null}>Select mapped account</option
									>{#each (accounts.data ?? []).filter((account) => !account.isGroup && !account.disabled && (mappings.data ?? []).some((mapping) => mapping.externalAccountId === account._id && mapping.status === 'active')) as account}<option
											value={account._id}>{account.accountName}</option
										>{/each}
								</select></label
							>
						</div>
						<button
							class="button primary"
							disabled={!selectedExportSource ||
								!exportPartyId ||
								!exportItemId ||
								!exportAccountId ||
								busy !== null}
							onclick={exportDraft}
							>{busy === 'export' ? 'Reconciling…' : 'Create draft in ERPNext'}</button
						>
					</div>
					{#if documentPushRuns.data?.length}<div class="mapping-list">
							{#each documentPushRuns.data as run}<div>
									<span
										><strong>{run.remoteReference}</strong><small
											>{run.documentType} · {formatDate(run.updatedAt)}</small
										></span
									><span
										>{run.providerDocumentId ?? run.errorCode ?? 'Awaiting provider result'}</span
									><StatusBadge status={run.status} />
								</div>{/each}
						</div>{/if}
				{:else}
					<div class="workflow-form">
						<h3>Post a verified settlement</h3>
						<p>Only succeeded Ratib payments and confirmed invoice receipts are eligible.</p>
						<label
							><span>Ratib settlement</span><select
								bind:value={settlementSourceKey}
								onchange={() => (settlementDocumentId = null)}
								><option value="">Select settled activity</option
								>{#each settlementSources.data ?? [] as source}<option
										value={`${source.sourceType}:${source.sourceId}`}
										>{source.direction === 'pay' ? 'Paid' : 'Received'} · {source.label} · {source.amount}
										USDC</option
									>{/each}</select
							></label
						>
						<div class="field-grid">
							<label
								><span>ERPNext invoice</span><select
									bind:value={settlementDocumentId}
									disabled={!selectedSettlementSource}
									><option value={null}>Select invoice</option
									>{#each eligibleSettlementDocuments as document}<option value={document._id}
											>{document.providerDocumentId} · {document.partyName ?? document.party} · {document.outstandingAmount}
											{document.currency}</option
										>{/each}</select
								></label
							><label
								><span>ERPNext bank account</span><select bind:value={settlementBankAccountId}
									><option value={null}>Select mapped account</option
									>{#each (accounts.data ?? []).filter((account) => !account.isGroup && !account.disabled && (mappings.data ?? []).some((mapping) => mapping.externalAccountId === account._id && mapping.status === 'active')) as account}<option
											value={account._id}>{account.accountName}</option
										>{/each}</select
								></label
							>
						</div>
						<button
							class="button primary"
							disabled={!selectedSettlementSource ||
								!settlementDocumentId ||
								!settlementBankAccountId ||
								busy !== null}
							onclick={postSettlement}
							>{busy === 'settlement' ? 'Reconciling…' : 'Reconcile and post'}</button
						>
					</div>
					{#if settlementRuns.data?.length}<div class="mapping-list">
							{#each settlementRuns.data as run}<div>
									<span
										><strong>{run.remoteReference}</strong><small
											>{run.direction} · {formatDate(run.createdAt)}</small
										></span
									><span>{run.providerDocumentId ?? 'No remote document yet'}</span><StatusBadge
										status={run.status}
									/>
								</div>{/each}
						</div>{/if}
				{/if}
			</div>

			<aside class="run-history" aria-labelledby="history-title">
				<header>
					<h3 id="history-title">Sync history</h3>
					<span>{runs.data?.length ?? 0}</span>
				</header>
				{#if runs.isLoading}<div class="history-empty">Loading…</div>
				{:else if runs.error}<div class="history-empty error" role="alert">
						{runs.error.message}
					</div>
				{:else if runs.data?.length === 0}<div class="history-empty">
						No sync attempts recorded.
					</div>
				{:else}<ol>
						{#each runs.data ?? [] as run}
							<li>
								<div>
									<StatusBadge status={run.status} /><time
										datetime={new Date(run.createdAt).toISOString()}
										>{formatDate(run.createdAt)}</time
									>
								</div>
								<strong
									>{run.itemCount === undefined
										? run.kind
										: `${run.itemCount} ${run.kind === 'masterData' ? 'reference records' : run.kind === 'chartOfAccounts' ? 'accounts' : 'documents'}`}</strong
								>
								{#if run.errorCode}<small>{run.errorCode}</small>{/if}
							</li>
						{/each}
					</ol>{/if}
			</aside>
		</div>
	</section>
{/if}

<style>
	.integration-layout {
		display: grid;
		grid-template-columns: minmax(330px, 0.9fr) minmax(390px, 1.1fr);
		gap: 14px;
		margin-bottom: 14px;
	}
	.connect-panel,
	.connections-panel,
	.detail-panel {
		border: 1px solid #d7e0e2;
		background: #fff;
	}
	.connect-panel > header,
	.connections-panel > header,
	.detail-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px;
		border-bottom: 1px solid #e4eaeb;
	}
	.connect-panel h2,
	.connections-panel h2,
	.detail-panel h2 {
		font-size: 0.92rem;
	}
	.connect-panel header p,
	.connections-panel header p,
	.detail-header p {
		margin-top: 4px;
		color: #718087;
		font-size: 0.68rem;
	}
	.provider-mark,
	.provider-icon {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid #bcd5d3;
		color: #176b64;
		background: #edf8f5;
	}
	.provider-mark {
		width: 38px;
		height: 38px;
	}
	.provider-icon {
		width: 32px;
		height: 32px;
	}
	.credential-choice {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 16px 18px 0;
		border: 1px solid #cedadd;
		padding: 10px 11px;
		color: #314d55;
	}
	.credential-choice input {
		width: 16px;
		height: 16px;
	}
	.credential-choice span,
	.credential-choice small {
		display: block;
	}
	.credential-choice small {
		margin-top: 2px;
		color: #708087;
		font-size: 0.6rem;
	}
	.mode-note {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		margin: 10px 18px 0;
		padding: 10px 11px;
		color: #48636a;
		background: #f2f7f7;
		font-size: 0.66rem;
		line-height: 1.45;
	}
	.mode-icon {
		display: inline-flex;
		flex: 0 0 auto;
		color: #22776e;
	}
	.connect-panel form {
		display: grid;
		gap: 12px;
		padding: 15px 18px 18px;
	}
	.connect-panel label {
		display: grid;
		gap: 6px;
	}
	.connect-panel label > span {
		color: #596a71;
		font-size: 0.64rem;
		font-weight: 750;
	}
	.connect-panel input,
	.search-box input {
		width: 100%;
		height: 40px;
		border: 1px solid #cbd6d9;
		padding: 0 11px;
		color: #20343a;
		background: #fff;
		outline: none;
	}
	.connect-panel input:focus,
	.search-box:focus-within {
		border-color: #318a86;
		box-shadow: 0 0 0 2px #dcefee;
	}
	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.submit {
		width: 100%;
		margin-top: 2px;
	}
	.connections-panel > header {
		justify-content: space-between;
	}
	.count {
		display: grid;
		width: 28px;
		height: 28px;
		place-items: center;
		border: 1px solid #cdd9db;
		color: #52666d;
		font-size: 0.68rem;
		font-weight: 800;
	}
	.empty {
		min-height: 150px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 24px;
		color: #718087;
		text-align: center;
		font-size: 0.68rem;
	}
	.empty strong {
		color: #2d444b;
		font-size: 0.76rem;
	}
	.connection-list article {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		border-bottom: 1px solid #e7ecec;
	}
	.connection-list article:last-child {
		border-bottom: 0;
	}
	.connection-list article.selected {
		box-shadow: inset 3px 0 #28837c;
		background: #fbfdfd;
	}
	.connection-main {
		display: flex;
		min-width: 0;
		align-items: flex-start;
		gap: 11px;
		border: 0;
		padding: 14px 16px;
		color: inherit;
		text-align: left;
		background: transparent;
	}
	.connection-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 4px;
		color: #68787e;
		font-size: 0.65rem;
	}
	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #22363c;
	}
	.name-row strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.connection-copy > span:nth-child(2) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.connection-copy small {
		color: #849096;
	}
	.connection-actions {
		display: flex;
		gap: 5px;
		padding-right: 13px;
	}
	.icon-action {
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid #ced9db;
		color: #45646a;
		background: #fff;
	}
	.icon-action:hover:not(:disabled) {
		border-color: #77aaa6;
		color: #176b64;
	}
	.icon-action.danger:hover:not(:disabled) {
		border-color: #d9a9ad;
		color: #a23d47;
		background: #fff7f7;
	}
	.icon-action:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.notice {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 14px;
		border-left: 3px solid #23867f;
		padding: 11px 13px;
		color: #256157;
		background: #edf8f5;
		font-size: 0.7rem;
	}
	.notice.error,
	.state-banner.error {
		border-color: #b84950;
		color: #96383f;
		background: #fff2f3;
	}
	.detail-panel {
		margin-bottom: 14px;
	}
	.detail-header {
		justify-content: space-between;
	}
	.detail-header > div:first-child {
		min-width: 0;
	}
	.detail-header h2 {
		margin-top: 5px;
	}
	.detail-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.search-box {
		display: flex;
		width: 220px;
		height: 38px;
		align-items: center;
		gap: 7px;
		border: 1px solid #cbd6d9;
		padding: 0 10px;
		color: #6a7b81;
	}
	.search-box input {
		height: auto;
		border: 0;
		padding: 0;
		box-shadow: none !important;
		font-size: 0.68rem;
	}
	.state-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		border-left: 3px solid #74878d;
		padding: 10px 14px;
		color: #536970;
		background: #f2f5f5;
		font-size: 0.68rem;
	}
	.configuration-strip {
		display: flex;
		align-items: end;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid #e2e8e9;
		background: #f8fafa;
	}
	.configuration-strip label {
		display: grid;
		gap: 5px;
	}
	.configuration-strip label > span,
	.workflow-form label > span {
		color: #62747b;
		font-size: 0.6rem;
		font-weight: 750;
	}
	.configuration-strip select,
	.workflow-form select {
		height: 36px;
		min-width: 180px;
		border: 1px solid #cbd6d9;
		padding: 0 9px;
		color: #263c42;
		background: #fff;
		font-size: 0.68rem;
	}
	.configuration-strip .toggle-field {
		display: flex;
		min-height: 36px;
		align-items: center;
		flex-direction: row;
		gap: 7px;
	}
	.configuration-strip .toggle-field input {
		width: 15px;
		height: 15px;
	}
	.detail-tabs {
		display: flex;
		overflow: auto;
		border-bottom: 1px solid #dce4e6;
		background: #fff;
	}
	.detail-tabs button {
		height: 40px;
		flex: 0 0 auto;
		border: 0;
		border-bottom: 2px solid transparent;
		padding: 0 15px;
		color: #697980;
		background: transparent;
		font-size: 0.66rem;
		font-weight: 750;
	}
	.detail-tabs button.active {
		border-bottom-color: #237c76;
		color: #195a56;
	}
	.workflow-form {
		display: grid;
		gap: 13px;
		padding: 18px;
		border-bottom: 1px solid #e4eaeb;
	}
	.workflow-form h3 {
		font-size: 0.78rem;
	}
	.workflow-form p {
		color: #718087;
		font-size: 0.65rem;
	}
	.workflow-form label {
		display: grid;
		gap: 6px;
	}
	.workflow-form > .button {
		width: fit-content;
	}
	.mapping-list > div {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid #edf0f1;
		font-size: 0.67rem;
	}
	.mapping-list span {
		min-width: 0;
	}
	.mapping-list strong,
	.mapping-list small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mapping-list small {
		margin-top: 3px;
		color: #7b898e;
		font-size: 0.58rem;
	}
	.mapping-arrow {
		color: #799096;
	}
	.details-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 250px;
	}
	.accounts-region {
		min-width: 0;
		border-right: 1px solid #e2e8e9;
	}
	.table-wrap {
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.68rem;
	}
	th,
	td {
		text-align: left;
		padding: 11px 14px;
		border-bottom: 1px solid #edf0f1;
		vertical-align: top;
	}
	th {
		color: #718087;
		font-size: 0.58rem;
		text-transform: uppercase;
	}
	td strong,
	td small {
		display: block;
	}
	td small {
		margin-top: 3px;
		color: #7c898f;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.table-empty {
		min-height: 240px;
	}
	.filter-empty {
		padding: 13px;
		color: #718087;
		text-align: center;
		font-size: 0.66rem;
	}
	.run-history > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 13px 14px;
		border-bottom: 1px solid #e5eaeb;
	}
	.run-history h3 {
		font-size: 0.73rem;
	}
	.run-history header span {
		color: #738188;
		font-size: 0.64rem;
	}
	.run-history ol {
		max-height: 440px;
		margin: 0;
		padding: 0;
		overflow: auto;
		list-style: none;
	}
	.run-history li {
		display: grid;
		gap: 7px;
		padding: 12px 14px;
		border-bottom: 1px solid #edf0f1;
	}
	.run-history li > div {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.run-history time,
	.run-history small {
		color: #7a888e;
		font-size: 0.58rem;
	}
	.run-history strong {
		font-size: 0.67rem;
	}
	.history-empty {
		padding: 24px 14px;
		color: #718087;
		text-align: center;
		font-size: 0.65rem;
	}
	.error {
		color: #9c3b42;
	}
	.spin {
		animation: spin 0.8s linear infinite;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (max-width: 1100px) {
		.integration-layout {
			grid-template-columns: 1fr;
		}
		.details-grid {
			grid-template-columns: 1fr;
		}
		.accounts-region {
			border-right: 0;
			border-bottom: 1px solid #e2e8e9;
		}
		.detail-header {
			align-items: flex-start;
			flex-direction: column;
		}
		.detail-actions {
			width: 100%;
		}
		.configuration-strip {
			align-items: stretch;
			flex-wrap: wrap;
		}
		.search-box {
			flex: 1;
		}
	}
	@media (max-width: 600px) {
		.field-grid {
			grid-template-columns: 1fr;
		}
		.connect-panel > header,
		.connections-panel > header,
		.detail-header {
			padding: 14px;
		}
		.connect-panel form {
			padding: 14px;
		}
		.credential-choice {
			margin: 14px 14px 0;
		}
		.mode-note {
			margin: 10px 14px 0;
		}
		.connection-list article {
			grid-template-columns: minmax(0, 1fr);
		}
		.connection-actions {
			padding: 0 14px 12px 57px;
		}
		.detail-actions {
			align-items: stretch;
			flex-direction: column;
		}
		.search-box {
			width: 100%;
		}
		.details-grid {
			display: block;
		}
		.configuration-strip {
			display: grid;
		}
		.configuration-strip select {
			width: 100%;
		}
		.mapping-list > div {
			grid-template-columns: 1fr auto;
		}
		.mapping-arrow {
			display: none;
		}
		th,
		td {
			padding: 10px;
		}
		th:nth-child(3),
		td:nth-child(3) {
			display: none;
		}
	}
</style>
