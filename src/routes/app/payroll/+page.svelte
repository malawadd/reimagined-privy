<script lang="ts">
	import { FileUp, Plus, Save, ShieldCheck, Trash2, Users } from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PayoutRunList from '$lib/components/PayoutRunList.svelte';
	import { assetDecimals, decimalToUnits, unitsToDecimal } from '$lib/domain';
	import { parseCsvRecords } from '$lib/payout-csv';
	import { workspace } from '$lib/workspace.svelte';

	const runs = useQuery(api.payouts.list, () =>
		workspace.activeOrganizationId
			? { organizationId: workspace.activeOrganizationId, type: 'payroll' as const }
			: 'skip'
	);
	const profiles = useQuery(api.payroll.listProfiles, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const compensation = useQuery(api.compensation.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const saveDraft = useMutation(api.payouts.saveDraft);
	const finalizeRun = useMutation(api.payouts.finalize);
	const submitRun = useMutation(api.payouts.submitForApproval);
	const approveRun = useMutation(api.payouts.approve);
	const dispatchRun = useMutation(api.payouts.dispatch);
	const setCompensation = useMutation(api.compensation.set);
	const retryPayout = useMutation(api.payouts.retryItem);
	const reconcilePayout = useMutation(api.payouts.reconcileItem);

	let name = $state('');
	let asset = $state<'ETH' | 'USDC'>('ETH');
	let sourceWalletId = $state('');
	type PayrollItem = {
		userId: string;
		amount: string;
		deduction: string;
		memo: string;
		sourceRow?: number;
	};
	let items = $state<PayrollItem[]>([{ userId: '', amount: '', deduction: '0', memo: '' }]);
	let runKey = $state('');
	let editingBatchId = $state('');
	let payPeriodStart = $state(new Date().toISOString().slice(0, 8) + '01');
	let payPeriodEnd = $state(new Date().toISOString().slice(0, 10));
	let payDate = $state(new Date().toISOString().slice(0, 10));
	let payrollKind = $state<'regular' | 'offCycle'>('regular');
	let scheduledAt = $state('');
	let compensationUserId = $state('');
	let baseAmount = $state('');
	let employeeCode = $state('');
	let department = $state('');
	let payFrequency = $state<'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'adhoc'>('monthly');
	let submitting = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	$effect(() => {
		if (!sourceWalletId)
			sourceWalletId = wallets.data?.find((wallet) => wallet.purpose !== 'collection')?._id ?? '';
	});

	let eligible = $derived(
		(profiles.data ?? []).filter(
			(entry) =>
				entry.membershipStatus === 'active' &&
				entry.profile?.eligibility === 'active' &&
				entry.profile.destinationKind &&
				entry.user
		)
	);
	let total = $derived.by(() => {
		try {
			return unitsToDecimal(
				items
					.reduce(
						(sum, item) =>
							sum +
							decimalToUnits(item.amount || '0', assetDecimals(asset)) -
							decimalToUnits(item.deduction || '0', assetDecimals(asset)),
						0n
					)
					.toString(),
				assetDecimals(asset)
			);
		} catch {
			return '0';
		}
	});

	function updateItem(
		index: number,
		field: 'userId' | 'amount' | 'deduction' | 'memo',
		value: string
	) {
		items = items.map((item, itemIndex) =>
			itemIndex === index ? { ...item, [field]: value } : item
		);
		if (field === 'userId') {
			const profile = (compensation.data ?? []).find((entry) => entry.profile.userId === value);
			if (profile)
				items = items.map((item, itemIndex) =>
					itemIndex === index && !item.amount
						? { ...item, amount: profile.profile.baseAmount }
						: item
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
				type: 'payroll',
				asset,
				name,
				sourceWalletId: sourceWalletId as Id<'wallets'>,
				idempotencyKey: runKey,
				payPeriodStart,
				payPeriodEnd,
				payDate,
				payrollKind,
				scheduledFor: scheduledAt ? new Date(scheduledAt).getTime() : undefined,
				denominationCurrency: asset === 'ETH' ? 'ETH' : 'USD',
				items: items.map((item) => ({
					userId: item.userId as Id<'users'>,
					earnings: [{ label: 'Gross pay', amount: item.amount }],
					deductions:
						item.deduction && item.deduction !== '0'
							? [{ label: 'Deductions', amount: item.deduction }]
							: undefined,
					memo: item.memo.trim() || undefined,
					sourceRow: item.sourceRow
				}))
			});
			message = `Payroll draft v${result.revision} saved. Finalize it after review.`;
			name = '';
			items = [{ userId: '', amount: '', deduction: '0', memo: '' }];
			runKey = '';
			editingBatchId = '';
			scheduledAt = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to queue payroll.';
		} finally {
			submitting = false;
		}
	}

	function editRun(run: {
		batch: {
			_id: string;
			asset: 'ETH' | 'USDC';
			name: string;
			sourceWalletId: string;
			requestKey?: string;
			payPeriodStart?: string;
			payPeriodEnd?: string;
			payDate?: string;
			scheduledFor?: number;
			payrollKind?: 'regular' | 'offCycle';
		};
		items: Array<{
			userId?: string;
			amount: string;
			memo?: string;
			sourceRow?: number;
			payslipSnapshot?: { grossAmount: string; deductionAmount: string };
		}>;
	}) {
		editingBatchId = run.batch._id;
		name = run.batch.name;
		asset = run.batch.asset;
		sourceWalletId = run.batch.sourceWalletId;
		runKey = run.batch.requestKey ?? crypto.randomUUID();
		payPeriodStart = run.batch.payPeriodStart ?? payPeriodStart;
		payPeriodEnd = run.batch.payPeriodEnd ?? payPeriodEnd;
		payDate = run.batch.payDate ?? payDate;
		payrollKind = run.batch.payrollKind ?? 'regular';
		scheduledAt = run.batch.scheduledFor ? toLocalDateTime(run.batch.scheduledFor) : '';
		items = run.items.map((item) => ({
			userId: item.userId ?? '',
			amount: item.payslipSnapshot?.grossAmount ?? item.amount,
			deduction: item.payslipSnapshot?.deductionAmount ?? '0',
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
		message = 'Payroll run duplicated as a new draft.';
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
					? 'Payroll run released. Privy authority still applies at dispatch.'
					: `Payroll ${action} completed.`;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : `Unable to ${action} payroll.`;
		}
	}

	async function importCsv(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			items = parseCsvRecords(await file.text()).map((row) => {
				const member = row.values.member ?? row.values.email ?? row.values.user_id;
				const match = eligible.find(
					(entry) =>
						entry.user && [entry.user._id, entry.user.email, entry.user.name].includes(member)
				);
				if (!match?.user)
					throw new Error(
						`CSV row ${row.sourceRow}: member was not found or is not payroll-ready.`
					);
				return {
					userId: match.user._id,
					amount: row.values.amount,
					deduction: row.values.deduction ?? row.values.deductions ?? '0',
					memo: row.values.memo ?? '',
					sourceRow: row.sourceRow
				};
			});
			message = `${items.length} payroll rows imported.`;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to import payroll CSV.';
		}
	}

	async function saveCompensation() {
		if (!workspace.activeOrganizationId || !compensationUserId) return;
		try {
			await setCompensation({
				organizationId: workspace.activeOrganizationId,
				userId: compensationUserId as Id<'users'>,
				employeeCode: employeeCode || undefined,
				department: department || undefined,
				baseAmount,
				denominationCurrency: asset === 'ETH' ? 'ETH' : 'USD',
				payFrequency,
				effectiveFrom: payPeriodStart
			});
			message = 'A new immutable compensation version was created.';
			baseAmount = '';
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save compensation.';
		}
	}

	async function retry(itemId: string) {
		if (!workspace.activeOrganizationId) return;
		error = null;
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

<svelte:head><title>Payroll | Ratib</title></svelte:head>
<PageHeader
	eyebrow="MEMBER PAYOUTS"
	title="Payroll"
	description="Pay verified member destinations in Base Sepolia ETH or USDC with immutable snapshots and Privy-enforced authority."
/>

{#if error}<p class="form-error notice" role="alert">{error}</p>{/if}
{#if message}<p class="success notice" role="status">{message}</p>{/if}

<div class="payroll-layout">
	<form
		class="panel composer"
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<header>
			<div>
				<h2>New payroll run</h2>
				<p>Each member and verified destination is frozen at submission.</p>
			</div>
			<Users size={19} />
		</header>
		<div class="fields">
			<label
				>Asset<select bind:value={asset} disabled={Boolean(editingBatchId)}
					><option value="ETH">ETH</option><option value="USDC">USDC</option></select
				></label
			>
			<label
				>Run name<input
					bind:value={name}
					maxlength="100"
					placeholder="September payroll"
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
			<label>Period start<input bind:value={payPeriodStart} type="date" required /></label>
			<label>Period end<input bind:value={payPeriodEnd} type="date" required /></label>
			<label>Pay date<input bind:value={payDate} type="date" required /></label>
			<label
				>Run type<select bind:value={payrollKind}
					><option value="regular">Regular</option><option value="offCycle">Off-cycle</option
					></select
				></label
			>
			<label>Schedule (optional)<input bind:value={scheduledAt} type="datetime-local" /></label>
		</div>
		<div class="item-heading">
			<strong>Payments</strong>
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
					onclick={() => (items = [...items, { userId: '', amount: '', deduction: '0', memo: '' }])}
					><Plus size={14} /> Add member</button
				>
			</div>
		</div>
		<div class="items">
			{#each items as item, index}
				<div class="item">
					<select
						aria-label={`Payroll member ${index + 1}`}
						value={item.userId}
						onchange={(event) => updateItem(index, 'userId', event.currentTarget.value)}
						required
					>
						<option value="">Verified member</option>
						{#each eligible as entry}{#if entry.user}<option value={entry.user._id}
									>{entry.user.name ?? entry.user.email}</option
								>{/if}{/each}
					</select>
					<div class="amount">
						<input
							aria-label={`Payroll gross amount ${index + 1}`}
							value={item.amount}
							oninput={(event) => updateItem(index, 'amount', event.currentTarget.value)}
							inputmode="decimal"
							placeholder="Gross pay"
							required
						/><span>{asset}</span>
					</div>
					<div class="amount">
						<input
							aria-label={`Payroll deductions ${index + 1}`}
							value={item.deduction}
							oninput={(event) => updateItem(index, 'deduction', event.currentTarget.value)}
							inputmode="decimal"
							placeholder="Deductions"
						/><span>{asset}</span>
					</div>
					<input
						aria-label={`Payroll memo ${index + 1}`}
						value={item.memo}
						oninput={(event) => updateItem(index, 'memo', event.currentTarget.value)}
						maxlength="140"
						placeholder="Reference (optional)"
					/>
					<button
						class="icon"
						type="button"
						aria-label={`Remove payroll member ${index + 1}`}
						disabled={items.length === 1}
						onclick={() => (items = items.filter((_, itemIndex) => itemIndex !== index))}
						><Trash2 size={14} /></button
					>
				</div>
			{/each}
		</div>
		<div class="total"><span>{items.length} payment(s)</span><strong>{total} {asset}</strong></div>
		<div class="authority">
			<ShieldCheck size={17} />
			<p>
				Ratib uses the active policy attached to this treasury. ETH uses an exact Privy intent; USDC
				automation is available only when the attached policy allows the complete run.
			</p>
		</div>
		<button
			class="button primary submit"
			disabled={submitting || total === '0' || items.some((item) => !item.userId)}
			>{submitting ? 'Saving…' : 'Save draft'} <Save size={14} /></button
		>
	</form>
	<aside class="panel readiness">
		<header>
			<div>
				<h2>Payroll readiness</h2>
				<p>Only eligible members with verified destinations appear.</p>
			</div>
		</header>
		<dl>
			<div>
				<dt>Eligible members</dt>
				<dd>{eligible.length}</dd>
			</div>
			<div>
				<dt>Executable network</dt>
				<dd>Base Sepolia</dd>
			</div>
			<div>
				<dt>Settlement asset</dt>
				<dd>{asset}</dd>
			</div>
			<div>
				<dt>Uncertain writes</dt>
				<dd>Block and reconcile</dd>
			</div>
		</dl>
		<form
			class="compensation"
			onsubmit={(event) => {
				event.preventDefault();
				void saveCompensation();
			}}
		>
			<h3>Compensation profile</h3>
			<select bind:value={compensationUserId} aria-label="Compensation member" required
				><option value="">Select member</option>{#each eligible as entry}{#if entry.user}<option
							value={entry.user._id}>{entry.user.name ?? entry.user.email}</option
						>{/if}{/each}</select
			>
			<div class="compact-fields">
				<input bind:value={employeeCode} placeholder="Employee code" /><input
					bind:value={department}
					placeholder="Department"
				/>
			</div>
			<div class="compact-fields">
				<input
					bind:value={baseAmount}
					inputmode="decimal"
					placeholder="Base amount"
					required
				/><select bind:value={payFrequency}
					><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option
						value="semimonthly">Semimonthly</option
					><option value="monthly">Monthly</option><option value="adhoc">Ad hoc</option></select
				>
			</div>
			<button class="button secondary">Create version</button>
			<small>{compensation.data?.length ?? 0} active profile(s)</small>
		</form>
		<a class="button secondary" href="/app/team">Manage member destinations</a>
	</aside>
</div>

<section class="panel history">
	<header>
		<div>
			<h2>Payroll runs</h2>
			<p>Per-member provider status and immutable destination evidence.</p>
		</div>
		<span>{runs.data?.length ?? 0} runs</span>
	</header>
	<PayoutRunList
		runs={runs.data ?? []}
		emptyMessage="No payroll runs yet."
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
	.payroll-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		gap: 14px;
		margin-bottom: 14px;
	}
	.composer {
		padding-bottom: 18px;
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
		grid-template-columns: minmax(150px, 1fr) 130px 130px minmax(140px, 1fr) 34px;
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
	.total {
		display: flex;
		justify-content: space-between;
		padding: 13px 18px;
		font-size: 0.72rem;
	}
	.authority {
		display: flex;
		gap: 8px;
		margin: 0 18px 14px;
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
	.submit {
		margin-left: 18px;
	}
	.readiness dl {
		margin: 0;
	}
	.readiness dl div {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px solid #e1e7e9;
		padding: 12px 16px;
		font-size: 0.65rem;
	}
	.readiness dt {
		color: #77868c;
	}
	.readiness dd {
		margin: 0;
		font-weight: 750;
	}
	.readiness > a {
		margin: 16px;
	}
	.compensation {
		display: grid;
		gap: 8px;
		border-top: 1px solid #e1e7e9;
		padding: 14px 16px 0;
	}
	.compensation h3 {
		margin: 0;
		font-size: 0.72rem;
	}
	.compensation small {
		color: #77868c;
		font-size: 0.58rem;
	}
	.compact-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}
	.history > header > span {
		color: #78868c;
		font-size: 0.68rem;
	}
	@media (max-width: 900px) {
		.payroll-layout {
			grid-template-columns: 1fr;
		}
	}
	@media (max-width: 680px) {
		.fields,
		.item {
			grid-template-columns: 1fr;
		}
		.icon {
			justify-self: end;
		}
	}
</style>
