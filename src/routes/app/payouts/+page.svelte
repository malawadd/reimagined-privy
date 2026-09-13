<script lang="ts">
	import { ContactRound, FileUp, Plus, Save, ShieldCheck, Trash2 } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PayoutRunList from '$lib/components/PayoutRunList.svelte';
	import { decimalToUnits, unitsToDecimal } from '$lib/domain';
	import { parseCsvRecords } from '$lib/payout-csv';
	import { workspace } from '$lib/workspace.svelte';

	const runs = useQuery(api.payouts.list, () =>
		workspace.activeOrganizationId
			? { organizationId: workspace.activeOrganizationId, type: 'batch' as const }
			: 'skip'
	);
	const recipients = useQuery(api.recipients.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const saveDraft = useMutation(api.payouts.saveDraft);
	const finalizeRun = useMutation(api.payouts.finalize);
	const submitRun = useMutation(api.payouts.submitForApproval);
	const approveRun = useMutation(api.payouts.approve);
	const dispatchRun = useMutation(api.payouts.dispatch);
	const retryPayout = useMutation(api.payouts.retryItem);
	const reconcilePayout = useMutation(api.payouts.reconcileItem);

	let name = $state('');
	let sourceWalletId = $state('');
	type PayoutItem = {
		recipientId: string;
		label: string;
		amount: string;
		memo: string;
		sourceRow?: number;
	};
	let items = $state<PayoutItem[]>([{ recipientId: '', label: '', amount: '', memo: '' }]);
	let runKey = $state('');
	let editingBatchId = $state('');
	let scheduledAt = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);

	$effect(() => {
		if (!sourceWalletId)
			sourceWalletId = wallets.data?.find((wallet) => wallet.purpose !== 'collection')?._id ?? '';
	});

	let approvedRecipients = $derived(
		(recipients.data ?? []).filter(
			(recipient) => recipient.status === 'approved' && recipient.assets.includes('USDC')
		)
	);
	let total = $derived.by(() => {
		try {
			return unitsToDecimal(
				items.reduce((sum, item) => sum + decimalToUnits(item.amount || '0', 6), 0n).toString(),
				6
			);
		} catch {
			return '0';
		}
	});

	function update(
		index: number,
		field: 'recipientId' | 'label' | 'amount' | 'memo',
		value: string
	) {
		items = items.map((item, itemIndex) =>
			itemIndex === index ? { ...item, [field]: value } : item
		);
		if (field === 'recipientId') {
			const recipient = approvedRecipients.find((candidate) => candidate._id === value);
			if (recipient)
				items = items.map((item, itemIndex) =>
					itemIndex === index ? { ...item, label: item.label || recipient.label } : item
				);
		}
	}

	async function submit() {
		if (!workspace.activeOrganizationId || !sourceWalletId) return;
		runKey ||= crypto.randomUUID();
		submitting = true;
		error = null;
		message = null;
		try {
			const result = await saveDraft({
				organizationId: workspace.activeOrganizationId,
				batchId: editingBatchId ? (editingBatchId as Id<'paymentBatches'>) : undefined,
				type: 'batch',
				name,
				sourceWalletId: sourceWalletId as Id<'wallets'>,
				idempotencyKey: runKey,
				scheduledFor: scheduledAt ? new Date(scheduledAt).getTime() : undefined,
				items: items.map((item) => ({
					label: item.label,
					recipientId: item.recipientId as Id<'recipients'>,
					amount: item.amount,
					memo: item.memo.trim() || undefined,
					sourceRow: item.sourceRow
				}))
			});
			message = `Payout draft v${result.revision} saved. Finalize it after review.`;
			name = '';
			items = [{ recipientId: '', label: '', amount: '', memo: '' }];
			runKey = '';
			editingBatchId = '';
			scheduledAt = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to queue payouts.';
		} finally {
			submitting = false;
		}
	}

	function editRun(run: {
		batch: {
			_id: string;
			name: string;
			sourceWalletId: string;
			requestKey?: string;
			scheduledFor?: number;
		};
		items: Array<{
			recipientId?: string;
			label: string;
			amount: string;
			memo?: string;
			sourceRow?: number;
		}>;
	}) {
		editingBatchId = run.batch._id;
		name = run.batch.name;
		sourceWalletId = run.batch.sourceWalletId;
		runKey = run.batch.requestKey ?? crypto.randomUUID();
		scheduledAt = run.batch.scheduledFor ? toLocalDateTime(run.batch.scheduledFor) : '';
		items = run.items.map((item) => ({
			recipientId: item.recipientId ?? '',
			label: item.label,
			amount: item.amount,
			memo: item.memo ?? '',
			sourceRow: item.sourceRow
		}));
		message = 'Draft loaded for editing.';
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function duplicateRun(run: Parameters<typeof editRun>[0]) {
		editRun(run);
		editingBatchId = '';
		runKey = crypto.randomUUID();
		name = `${run.batch.name} copy`;
		message = 'Payout run duplicated as a new draft.';
	}

	function toLocalDateTime(value: number) {
		const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000);
		return date.toISOString().slice(0, 16);
	}

	async function runAction(
		action: 'finalize' | 'submit' | 'approve' | 'dispatch',
		batchId: string
	) {
		if (!workspace.activeOrganizationId) return;
		error = null;
		try {
			const args = {
				organizationId: workspace.activeOrganizationId,
				batchId: batchId as Id<'paymentBatches'>
			};
			if (action === 'finalize') await finalizeRun(args);
			else if (action === 'submit') await submitRun(args);
			else if (action === 'approve') await approveRun(args);
			else await dispatchRun(args);
			message =
				action === 'approve'
					? 'Payout run released. Privy authority still applies at dispatch.'
					: `Payout ${action} completed.`;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : `Unable to ${action} payout.`;
		}
	}

	async function importCsv(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			items = parseCsvRecords(await file.text()).map((row) => {
				const identifier =
					row.values.recipient ?? row.values.counterparty ?? row.values.recipient_id;
				const recipient = approvedRecipients.find((candidate) =>
					[candidate._id, candidate.label].includes(identifier)
				);
				if (!recipient)
					throw new Error(`CSV row ${row.sourceRow}: approved counterparty was not found.`);
				return {
					recipientId: recipient._id,
					label: row.values.label || recipient.label,
					amount: row.values.amount,
					memo: row.values.memo ?? '',
					sourceRow: row.sourceRow
				};
			});
			message = `${items.length} payout rows imported.`;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to import payout CSV.';
		}
	}

	async function retry(itemId: string) {
		if (!workspace.activeOrganizationId) return;
		try {
			await retryPayout({
				organizationId: workspace.activeOrganizationId,
				itemId: itemId as Id<'paymentBatchItems'>,
				idempotencyKey: crypto.randomUUID()
			});
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to retry payout.';
		}
	}

	async function reconcile(itemId: string) {
		if (!workspace.activeOrganizationId) return;
		error = null;
		try {
			const result = await reconcilePayout({
				organizationId: workspace.activeOrganizationId,
				itemId: itemId as Id<'paymentBatchItems'>
			});
			message = result.scheduled ? 'Provider reconciliation queued.' : (result.reason ?? null);
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to reconcile payout.';
		}
	}
</script>

<svelte:head><title>Payouts | Ratib</title></svelte:head>
<PageHeader
	eyebrow="BULK MONEY MOVEMENT"
	title="Payouts"
	description="Send independently traceable Base Sepolia USDC payouts to organization counterparties."
/>

{#if error}<p class="form-error notice" role="alert">{error}</p>{/if}
{#if message}<p class="success notice" role="status">{message}</p>{/if}

<section class="panel composer">
	<header>
		<div>
			<h2>New payout run</h2>
			<p>Review the aggregate amount and exact destination snapshot before dispatch.</p>
		</div>
		<ContactRound size={19} />
	</header>
	<form
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<div class="fields">
			<label
				>Run name<input
					bind:value={name}
					maxlength="100"
					placeholder="Vendor settlement"
					required
				/></label
			>
			<label
				>Source treasury<select bind:value={sourceWalletId} required
					><option value="">Select wallet</option
					>{#each (wallets.data ?? []).filter((wallet) => wallet.purpose !== 'collection') as wallet}<option
							value={wallet._id}>{wallet.name}</option
						>{/each}</select
				></label
			>
			<label>Schedule (optional)<input bind:value={scheduledAt} type="datetime-local" /></label>
		</div>
		<div class="item-heading">
			<strong>Counterparties</strong>
			<div class="item-tools">
				<label class="file-button"
					><FileUp size={14} /> Import CSV<input
						type="file"
						accept=".csv,text/csv"
						onchange={importCsv}
					/></label
				>
				<button
					type="button"
					onclick={() => (items = [...items, { recipientId: '', label: '', amount: '', memo: '' }])}
					><Plus size={14} /> Add payout</button
				>
			</div>
		</div>
		<div class="items">
			{#each items as item, index}
				<div class="item">
					<select
						aria-label={`Payout recipient ${index + 1}`}
						value={item.recipientId}
						onchange={(event) => update(index, 'recipientId', event.currentTarget.value)}
						required
						><option value="">Approved counterparty</option
						>{#each approvedRecipients as recipient}<option value={recipient._id}
								>{recipient.label}</option
							>{/each}</select
					>
					<input
						aria-label={`Payout label ${index + 1}`}
						value={item.label}
						oninput={(event) => update(index, 'label', event.currentTarget.value)}
						maxlength="100"
						placeholder="Payment label"
						required
					/>
					<div class="amount">
						<input
							aria-label={`Payout amount ${index + 1}`}
							value={item.amount}
							oninput={(event) => update(index, 'amount', event.currentTarget.value)}
							inputmode="decimal"
							placeholder="0.00"
							required
						/><span>USDC</span>
					</div>
					<input
						aria-label={`Payout memo ${index + 1}`}
						value={item.memo}
						oninput={(event) => update(index, 'memo', event.currentTarget.value)}
						maxlength="140"
						placeholder="Memo (optional)"
					/>
					<button
						class="icon"
						type="button"
						aria-label={`Remove payout ${index + 1}`}
						disabled={items.length === 1}
						onclick={() => (items = items.filter((_, itemIndex) => itemIndex !== index))}
						><Trash2 size={14} /></button
					>
				</div>
			{/each}
		</div>
		<div class="footer">
			<div class="authority">
				<ShieldCheck size={17} />
				<p>
					Directory approval is not signing authority. Ratib checks the active Privy policy attached
					to the source wallet before selecting automation.
				</p>
			</div>
			<div class="total">
				<span>{items.length} payout(s)</span><strong>{total} USDC</strong><button
					class="button primary"
					disabled={submitting || total === '0' || items.some((item) => !item.recipientId)}
					>{submitting ? 'Saving…' : 'Save draft'} <Save size={14} /></button
				>
			</div>
		</div>
	</form>
</section>

<section class="panel history">
	<header>
		<div>
			<h2>Payout runs</h2>
			<p>Definitive failures may be retried; ambiguous writes remain blocked.</p>
		</div>
		<a class="button secondary" href="/app/counterparties">Manage counterparties</a>
	</header>
	<PayoutRunList
		runs={runs.data ?? []}
		emptyMessage="No payout runs yet."
		onRetry={retry}
		onReconcile={reconcile}
		onFinalize={(id) => runAction('finalize', id)}
		onSubmit={(id) => runAction('submit', id)}
		onApprove={(id) => runAction('approve', id)}
		onDispatch={(id) => runAction('dispatch', id)}
		onEdit={editRun}
		onDuplicate={duplicateRun}
	/>
</section>

<style>
	.notice {
		margin-bottom: 12px;
	}
	.success {
		border: 1px solid #bad8cb;
		padding: 10px 12px;
		color: #276052;
		background: #eff8f4;
		font-size: 0.7rem;
	}
	.composer {
		margin-bottom: 14px;
	}
	.fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding: 16px 18px 0;
	}
	label {
		display: grid;
		gap: 6px;
		color: #40545b;
		font-size: 0.66rem;
		font-weight: 750;
	}
	input,
	select {
		min-width: 0;
		border: 1px solid #d5dee1;
		border-radius: 5px;
		padding: 9px 10px;
		background: white;
		font: inherit;
		font-size: 0.72rem;
	}
	.item-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 18px 18px 8px;
		font-size: 0.68rem;
	}
	.item-heading button,
	.file-button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		border: 0;
		color: #276052;
		background: transparent;
		font: inherit;
		font-weight: 750;
	}
	.item-tools {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.file-button {
		cursor: pointer;
	}
	.file-button input {
		display: none;
	}
	.items {
		border-top: 1px solid #e0e6e8;
	}
	.item {
		display: grid;
		grid-template-columns: 1fr 1fr 150px 1fr 34px;
		gap: 8px;
		align-items: center;
		border-bottom: 1px solid #e0e6e8;
		padding: 9px 18px;
	}
	.amount {
		display: flex;
		align-items: stretch;
	}
	.amount input {
		width: 100%;
		border-radius: 5px 0 0 5px;
	}
	.amount span {
		display: grid;
		place-items: center;
		border: 1px solid #d5dee1;
		border-left: 0;
		padding: 0 7px;
		color: #718087;
		background: #f5f8f8;
		font-size: 0.56rem;
	}
	.icon {
		display: grid;
		width: 32px;
		height: 32px;
		place-items: center;
		border: 1px solid #d9e1e3;
		border-radius: 5px;
		color: #8d4640;
		background: white;
	}
	.footer {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 20px;
		align-items: center;
		padding: 14px 18px 18px;
	}
	.authority {
		display: flex;
		gap: 8px;
		max-width: 680px;
		border-left: 3px solid #397563;
		padding: 8px 10px;
		color: #64777d;
		background: #f2f7f5;
		font-size: 0.63rem;
		line-height: 1.5;
	}
	.authority p {
		margin: 0;
	}
	.total {
		display: grid;
		grid-template-columns: auto auto;
		gap: 3px 12px;
		align-items: center;
		text-align: right;
		font-size: 0.66rem;
	}
	.total strong {
		font-size: 0.9rem;
	}
	.total button {
		grid-column: 1 / -1;
	}
	@media (max-width: 860px) {
		.item {
			grid-template-columns: 1fr 1fr;
		}
		.footer {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 620px) {
		.fields,
		.item {
			grid-template-columns: 1fr;
		}
		.icon {
			justify-self: end;
		}
	}
</style>
