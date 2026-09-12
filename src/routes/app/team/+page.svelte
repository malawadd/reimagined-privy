<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { ExternalLink, ShieldAlert, Users } from '@lucide/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { workspace } from '$lib/workspace.svelte';

	const members = useQuery(api.members.list, () =>
		workspace.activeOrganizationId ? { organizationId: workspace.activeOrganizationId } : 'skip'
	);
	const dashboardUrl =
		env.PUBLIC_PRIVY_DASHBOARD_APPROVALS_URL || 'https://dashboard.privy.io/apps';
	function initials(name?: string, email?: string) {
		return (name || email || 'Member')
			.split(/[\s@]+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase();
	}
</script>

<svelte:head><title>Team | Ratib</title></svelte:head>

<PageHeader
	eyebrow="ACCESS CONTROL"
	title="Team"
	description="Organization application access, kept visibly separate from Privy signing authority."
/>

<div class="authority-banner">
	<ShieldAlert size={21} />
	<div>
		<strong>Two independent authorization layers</strong>
		<p>
			Ratib roles control which organization data and workflows a user may access. Privy quorum
			membership controls who can approve wallet, policy, and transfer intents.
		</p>
	</div>
	<a href={dashboardUrl} target="_blank" rel="noreferrer"
		>Manage reviewers <ExternalLink size={14} /></a
	>
</div>

<section class="panel">
	<header>
		<div>
			<h2>Workspace members</h2>
			<p>{members.data?.length ?? 0} assigned identities</p>
		</div>
		<Users size={19} />
	</header>
	{#if members.isLoading}<div class="team-empty">Loading organization membership…</div>
	{:else if members.error}<div class="team-empty error" role="alert">{members.error.message}</div>
	{:else if members.data?.length === 0}<div class="team-empty">
			No active memberships are visible.
		</div>
	{:else}<div class="table-wrap">
			<table>
				<thead
					><tr><th>Member</th><th>Application role</th><th>Privy authority</th><th>Access</th></tr
					></thead
				><tbody
					>{#each members.data ?? [] as member}<tr
							><td
								><div class="table-title">
									<span class="member-avatar">{initials(member.user.name, member.user.email)}</span>
									<div>
										<strong>{member.user.name ?? 'Unnamed member'}</strong><small
											>{member.user.email ?? member.user.privyDid}</small
										>
									</div>
								</div></td
							><td><span class="role-pill">{member.role}</span></td><td
								><strong>Verify in Privy Dashboard</strong></td
							><td><StatusBadge status={member.status} /></td></tr
						>{/each}</tbody
				>
			</table>
		</div>{/if}
</section>

<section class="role-guide">
	<h2>Application role guide</h2>
	<div class="role-cards">
		<article>
			<strong>Owner</strong>
			<p>Organization lifecycle and every operational capability.</p>
		</article>
		<article>
			<strong>Admin</strong>
			<p>Team and operational configuration, except organization transfer.</p>
		</article>
		<article>
			<strong>Operator</strong>
			<p>Create payments and manage approved automation definitions.</p>
		</article>
		<article>
			<strong>Approver</strong>
			<p>View pending work; signing still requires Privy reviewer membership.</p>
		</article>
		<article>
			<strong>Auditor</strong>
			<p>Read-only access to wallets, operations, policies, and audit history.</p>
		</article>
	</div>
</section>

<style>
	.team-empty {
		display: grid;
		min-height: 230px;
		place-items: center;
		color: #748188;
		font-size: 0.74rem;
	}
	.team-empty.error {
		color: #9d4039;
	}
</style>
