<script lang="ts">
	import {
		Check,
		MailPlus,
		Pause,
		Play,
		ShieldCheck,
		UserPlus,
		Users,
		WalletCards,
		X
	} from '@lucide/svelte';
	import { useMutation, useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { privyAuth } from '$lib/auth/privy.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const members = useQuery(api.members.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const invitations = useQuery(api.members.listInvitations, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const wallets = useQuery(api.wallets.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const profiles = useQuery(api.payroll.listProfiles, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const inviteMember = useMutation(api.members.invite);
	const revokeInvitation = useMutation(api.members.revokeInvitation);
	const changeRole = useMutation(api.members.changeRole);
	const suspendMember = useMutation(api.members.suspend);
	const restoreMember = useMutation(api.members.restore);
	const setAssignment = useMutation(api.walletAssignments.set);
	const syncPersonalWallet = useMutation(api.payroll.syncPersonalWallet);
	const createChallenge = useMutation(api.payroll.createExternalChallenge);
	const verifyDestination = useMutation(api.payroll.verifyExternalDestination);
	const setEligibility = useMutation(api.payroll.setEligibility);

	let showInvite = $state(false);
	let email = $state('');
	let inviteRole = $state<'admin' | 'operator' | 'approver' | 'auditor'>('operator');
	let grants = $state<Record<string, string[]>>({});
	let error = $state<string | null>(null);
	let busy = $state(false);
	let assignmentMember = $state('');
	let assignmentWallet = $state('');
	let assignmentPermissions = $state<string[]>(['view']);
	let externalAddress = $state('');
	const permissions = ['view', 'initiate', 'approve', 'manage'] as const;
	function userError(caught: unknown, fallback: string) {
		if (!(caught instanceof Error)) return fallback;
		return (
			caught.message.match(/Uncaught Error:\s*(.*?)(?=\s+at\s+(?:async\s+)?[\w$]+\s*\(|$)/s)?.[1] ??
			caught.message
		);
	}
	function toggleGrant(walletId: string, permission: string) {
		const current = grants[walletId] ?? [];
		grants = {
			...grants,
			[walletId]: current.includes(permission)
				? current.filter((value) => value !== permission)
				: [...current, permission]
		};
	}
	function toggleAssignment(permission: string) {
		assignmentPermissions = assignmentPermissions.includes(permission)
			? assignmentPermissions.filter((value) => value !== permission)
			: [...assignmentPermissions, permission];
	}
	async function invite() {
		if (!workspace.activeOrganizationId) return;
		busy = true;
		error = null;
		try {
			await inviteMember({
				organizationId: workspace.activeOrganizationId,
				email,
				role: inviteRole,
				walletGrants: Object.entries(grants)
					.filter(([, p]) => p.length)
					.map(([walletId, p]) => ({
						walletId: walletId as Id<'wallets'>,
						permissions: p as ('view' | 'initiate' | 'approve' | 'manage')[]
					}))
			});
			email = '';
			grants = {};
			showInvite = false;
		} catch (c) {
			error = userError(c, 'Unable to invite member.');
		} finally {
			busy = false;
		}
	}
	async function updateRole(event: Event, membershipId: Id<'memberships'>, previousRole: string) {
		if (!workspace.activeOrganizationId) return;
		const select = event.currentTarget as HTMLSelectElement;
		error = null;
		try {
			await changeRole({
				organizationId: workspace.activeOrganizationId,
				membershipId,
				role: select.value as 'owner' | 'admin' | 'operator' | 'approver' | 'auditor'
			});
		} catch (c) {
			select.value = previousRole;
			error = userError(c, 'Unable to change role.');
		}
	}
	async function toggleAccess(membershipId: Id<'memberships'>, status: string) {
		if (!workspace.activeOrganizationId) return;
		error = null;
		try {
			await (status === 'active' ? suspendMember : restoreMember)({
				organizationId: workspace.activeOrganizationId,
				membershipId
			});
		} catch (c) {
			error = userError(c, 'Unable to update member access.');
		}
	}
	async function saveAssignment() {
		if (!workspace.activeOrganizationId || !assignmentMember || !assignmentWallet) return;
		busy = true;
		error = null;
		try {
			await setAssignment({
				organizationId: workspace.activeOrganizationId,
				membershipId: assignmentMember as Id<'memberships'>,
				walletId: assignmentWallet as Id<'wallets'>,
				permissions: assignmentPermissions as ('view' | 'initiate' | 'approve' | 'manage')[]
			});
		} catch (c) {
			error = userError(c, 'Unable to update wallet access.');
		} finally {
			busy = false;
		}
	}
	async function toggleEligibility(membershipId: Id<'memberships'>, current?: string) {
		if (!workspace.activeOrganizationId) return;
		try {
			await setEligibility({
				organizationId: workspace.activeOrganizationId,
				membershipId,
				eligibility: current === 'paused' ? 'active' : 'paused'
			});
		} catch (c) {
			error = userError(c, 'Unable to update payroll eligibility.');
		}
	}
	async function createPersonal() {
		if (!workspace.activeOrganizationId) return;
		busy = true;
		error = null;
		try {
			await privyAuth.ensurePersonalWallet(
				(wallets.data ?? []).map((wallet) => wallet.privyWalletId)
			);
			await syncPersonalWallet({ organizationId: workspace.activeOrganizationId });
		} catch (c) {
			error = userError(c, 'Unable to create personal wallet.');
		} finally {
			busy = false;
		}
	}
	async function verifyExternal() {
		if (!workspace.activeOrganizationId) return;
		busy = true;
		error = null;
		try {
			const ethereum = (
				window as Window & {
					ethereum?: { request(input: { method: string; params?: unknown[] }): Promise<unknown> };
				}
			).ethereum;
			if (!ethereum) throw new Error('Connect an EVM wallet extension to verify this address.');
			const challenge = await createChallenge({
				organizationId: workspace.activeOrganizationId,
				address: externalAddress
			});
			const signature = await ethereum.request({
				method: 'personal_sign',
				params: [challenge.message, externalAddress]
			});
			if (typeof signature !== 'string') throw new Error('The wallet did not return a signature.');
			await verifyDestination({
				organizationId: workspace.activeOrganizationId,
				challengeId: challenge.challengeId,
				signature
			});
			externalAddress = '';
		} catch (c) {
			error = userError(c, 'Unable to verify wallet.');
		} finally {
			busy = false;
		}
	}
	function initials(name?: string, email?: string) {
		return (name || email || 'Member')
			.split(/[\s@]+/)
			.slice(0, 2)
			.map((p) => p[0])
			.join('')
			.toUpperCase();
	}
	let ownProfile = $derived(
		(profiles.data ?? []).find((row) => row.user?.privyDid === privyAuth.user?.id)
	);
</script>

<svelte:head><title>Team | Ratib</title></svelte:head>
<PageHeader
	eyebrow="ACCESS CONTROL"
	title="Team & payout access"
	description="Invite people, assign operational wallet permissions, and manage verified payroll destinations inside Ratib."
	>{#snippet action()}<button class="button primary" onclick={() => (showInvite = true)}
			><UserPlus size={15} /> Invite member</button
		>{/snippet}</PageHeader
>
{#if error}<p class="form-error page-error" role="alert">{error}</p>{/if}

<div class="authority-banner">
	<ShieldCheck size={21} />
	<div>
		<strong>Ratib roles and Privy signing remain distinct</strong>
		<p>
			Wallet approval access becomes effective only after the existing Privy quorum authorizes the
			change in Ratib.
		</p>
	</div>
</div>

<section class="panel">
	<header>
		<div>
			<h2>Workspace members</h2>
			<p>{members.data?.length ?? 0} verified identities</p>
		</div>
		<Users size={19} />
	</header>
	{#if members.isLoading}<div class="empty">Loading members…</div>{:else}<div class="table-wrap">
			<table>
				<thead><tr><th>Member</th><th>Role</th><th>Payroll</th><th>Access</th><th></th></tr></thead
				><tbody>
					{#each members.data ?? [] as member}{@const payroll = (profiles.data ?? []).find(
							(p) => p.membershipId === member.membershipId
						)}<tr
							><td
								><div class="table-title">
									<span class="member-avatar">{initials(member.user.name, member.user.email)}</span>
									<div>
										<strong>{member.user.name ?? 'Unnamed member'}</strong><small
											>{member.user.email ?? member.user.privyDid}</small
										>
									</div>
								</div></td
							><td
								><select
									value={member.role}
									onchange={(e) => updateRole(e, member.membershipId, member.role)}
									>{#each ['owner', 'admin', 'operator', 'approver', 'auditor'] as role}<option
											value={role}>{role}</option
										>{/each}</select
								></td
							><td
								><button
									class="plain-status"
									onclick={() =>
										toggleEligibility(member.membershipId, payroll?.profile?.eligibility)}
									title="Toggle payroll eligibility"
									><StatusBadge
										status={payroll?.profile?.eligibility ?? 'not configured'}
									/></button
								></td
							><td><StatusBadge status={member.status} /></td><td
								><button
									class="icon-button"
									title={member.status === 'active' ? 'Suspend access' : 'Restore access'}
									aria-label={member.status === 'active' ? 'Suspend access' : 'Restore access'}
									onclick={() => toggleAccess(member.membershipId, member.status)}
									>{#if member.status === 'active'}<Pause size={14} />{:else}<Play
											size={14}
										/>{/if}</button
								></td
							></tr
						>{/each}
				</tbody>
			</table>
		</div>{/if}
</section>

<div class="two-col team-tools">
	<section class="panel">
		<header>
			<div>
				<h2>Wallet assignments</h2>
				<p>Independent view, initiate, approve, and manage permissions.</p>
			</div>
			<WalletCards size={18} />
		</header>
		<form
			class="assignment"
			onsubmit={(e) => {
				e.preventDefault();
				void saveAssignment();
			}}
		>
			<label
				>Member<select bind:value={assignmentMember} required
					><option value="">Select member</option>{#each members.data ?? [] as member}<option
							value={member.membershipId}>{member.user.name ?? member.user.email}</option
						>{/each}</select
				></label
			><label
				>Wallet<select bind:value={assignmentWallet} required
					><option value="">Select wallet</option>{#each wallets.data ?? [] as wallet}<option
							value={wallet._id}>{wallet.name}</option
						>{/each}</select
				></label
			>
			<fieldset>
				<legend>Permissions</legend>{#each permissions as permission}<label
						><input
							type="checkbox"
							checked={assignmentPermissions.includes(permission)}
							onchange={() => toggleAssignment(permission)}
						/><span>{permission}</span></label
					>{/each}
			</fieldset>
			<button class="button primary" disabled={busy}>Save assignment</button>
		</form>
	</section>
	<section class="panel">
		<header>
			<div>
				<h2>Your salary destination</h2>
				<p>Only you can replace this verified destination.</p>
			</div>
			<ShieldCheck size={18} />
		</header>
		<div class="payout">
			<div class="destination">
				<span>CURRENT</span><strong
					>{ownProfile?.personalWallet?.address ??
						ownProfile?.profile?.externalAddress ??
						'Not configured'}</strong
				><small>{ownProfile?.profile?.destinationKind ?? 'Choose a destination below'}</small>
			</div>
			<button class="button secondary" onclick={createPersonal} disabled={busy}
				><WalletCards size={14} /> Create or use Ratib wallet</button
			>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void verifyExternal();
				}}
			>
				<label for="external-wallet">External EVM wallet</label>
				<div>
					<input
						id="external-wallet"
						bind:value={externalAddress}
						placeholder="0x…"
						required
					/><button class="button secondary" disabled={busy}>Verify ownership</button>
				</div>
			</form>
		</div>
	</section>
</div>

<section class="panel invitations">
	<header>
		<div>
			<h2>Invitations</h2>
			<p>Matched to the member’s server-verified Privy email.</p>
		</div>
		<MailPlus size={18} />
	</header>
	{#if !(invitations.data ?? []).length}<div class="empty">
			No invitations yet.
		</div>{:else}{#each invitations.data ?? [] as invitation}<article>
				<div>
					<strong>{invitation.email}</strong><small
						>{invitation.role} · expires {new Date(
							invitation.expiresAt
						).toLocaleDateString()}</small
					>
				</div>
				<StatusBadge status={invitation.status} />{#if invitation.status === 'pending'}<button
						class="icon-button"
						aria-label="Revoke invitation"
						title="Revoke invitation"
						onclick={() =>
							workspace.activeOrganizationId &&
							revokeInvitation({
								organizationId: workspace.activeOrganizationId,
								invitationId: invitation._id
							})}><X size={14} /></button
					>{/if}
			</article>{/each}{/if}
</section>

{#if showInvite}<div class="modal-backdrop">
		<div class="invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
			<button class="dialog-close" aria-label="Close" onclick={() => (showInvite = false)}
				><X size={17} /></button
			>
			<p class="eyebrow">NEW MEMBER</p>
			<h2 id="invite-title">Invite to this workspace</h2>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void invite();
				}}
			>
				<label>Email<input type="email" bind:value={email} required /></label><label
					>Role<select bind:value={inviteRole}
						><option value="admin">Admin</option><option value="operator">Operator</option><option
							value="approver">Approver</option
						><option value="auditor">Auditor</option></select
					></label
				>
				<div class="grant-list">
					<strong>Initial wallet access</strong>{#each wallets.data ?? [] as wallet}<article>
							<span>{wallet.name}</span>{#each permissions as permission}<label
									><input
										type="checkbox"
										checked={(grants[wallet._id] ?? []).includes(permission)}
										onchange={() => toggleGrant(wallet._id, permission)}
									/>{permission}</label
								>{/each}
						</article>{/each}
				</div>
				<button class="button primary" disabled={busy}
					><Check size={14} /> Send in-app invitation</button
				>
			</form>
		</div>
	</div>{/if}

<style>
	.page-error {
		margin-bottom: 12px;
	}
	.empty {
		display: grid;
		min-height: 150px;
		place-items: center;
		color: #75838a;
		font-size: 0.72rem;
	}
	table select,
	.assignment select,
	.invite-dialog select {
		border: 1px solid #d6dfe2;
		border-radius: 4px;
		padding: 7px;
		background: white;
		font: inherit;
		font-size: 0.66rem;
	}
	.team-tools {
		margin-top: 14px;
	}
	.assignment {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
		padding: 20px;
	}
	.assignment > label,
	.invite-dialog form > label,
	.payout form > label {
		display: grid;
		gap: 6px;
		color: #354950;
		font-size: 0.65rem;
		font-weight: 750;
	}
	.assignment fieldset {
		grid-column: 1/-1;
		display: flex;
		gap: 14px;
		border: 0;
		padding: 0;
	}
	.assignment legend {
		margin-bottom: 8px;
		font-size: 0.65rem;
		font-weight: 750;
	}
	.assignment fieldset label {
		display: flex;
		gap: 5px;
		text-transform: capitalize;
		font-size: 0.66rem;
	}
	.assignment .button {
		width: fit-content;
	}
	.payout {
		display: grid;
		gap: 13px;
		padding: 20px;
	}
	.destination {
		display: grid;
		border: 1px solid #dce4e6;
		padding: 13px;
	}
	.destination span {
		font-size: 0.54rem;
		font-weight: 800;
	}
	.destination strong {
		overflow-wrap: anywhere;
		margin: 5px 0;
		font-family: monospace;
		font-size: 0.65rem;
	}
	.destination small {
		color: #748188;
	}
	.payout > .button {
		width: fit-content;
	}
	.payout form div {
		display: flex;
		gap: 7px;
	}
	.payout input,
	.invite-dialog input {
		width: 100%;
		border: 1px solid #d6dfe2;
		border-radius: 4px;
		padding: 9px;
		font: inherit;
		font-size: 0.7rem;
	}
	.invitations {
		margin-top: 14px;
	}
	.invitations article {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 12px;
		align-items: center;
		border-bottom: 1px solid #e0e6e8;
		padding: 13px 18px;
	}
	.invitations small {
		display: block;
		margin-top: 4px;
		color: #7a888e;
		font-size: 0.58rem;
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
	.invite-dialog {
		position: relative;
		width: min(720px, 100%);
		max-height: calc(100vh - 40px);
		overflow: auto;
		border-radius: 7px;
		padding: 28px;
		background: white;
	}
	.dialog-close {
		position: absolute;
		top: 16px;
		right: 16px;
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid #d8e1e3;
		background: white;
	}
	.invite-dialog h2 {
		margin: 9px 0 16px;
		font-family: Georgia, serif;
		font-size: 1.5rem;
		font-weight: 500;
	}
	.invite-dialog form {
		display: grid;
		gap: 13px;
	}
	.grant-list {
		display: grid;
		gap: 5px;
	}
	.grant-list > strong {
		font-size: 0.67rem;
	}
	.grant-list article {
		display: grid;
		grid-template-columns: 1fr repeat(4, auto);
		gap: 12px;
		border: 1px solid #e0e6e8;
		padding: 10px;
	}
	.grant-list label {
		display: flex;
		gap: 4px;
		text-transform: capitalize;
		font-size: 0.62rem;
	}
	@media (max-width: 800px) {
		.assignment {
			grid-template-columns: 1fr;
		}
		.grant-list article {
			grid-template-columns: 1fr 1fr;
		}
		.payout form div {
			flex-direction: column;
		}
	}
	.plain-status {
		border: 0;
		padding: 0;
		background: transparent;
	}
</style>
