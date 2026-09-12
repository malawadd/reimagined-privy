<script lang="ts">
	import { ExternalLink, Plus, ShieldAlert, Users } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { team } from '$lib/mock-data';
</script>

<PageHeader
	eyebrow="ACCESS CONTROL"
	title="Team"
	description="Manage application access while keeping Privy reviewer authority visibly separate."
>
	{#snippet action()}<button class="button primary"><Plus size={15} /> Invite member</button
		>{/snippet}
</PageHeader>

<div class="authority-banner">
	<ShieldAlert size={21} />
	<div>
		<strong>Two independent authorization layers</strong>
		<p>
			Northstar roles control what users can request and view. Privy Dashboard quorum membership
			controls who can approve wallet and policy intents.
		</p>
	</div>
	<a href="https://dashboard.privy.io/apps" target="_blank" rel="noreferrer"
		>Manage reviewers <ExternalLink size={14} /></a
	>
</div>
<section class="panel">
	<header>
		<div>
			<h2>Workspace members</h2>
			<p>{team.length} active members · one organization</p>
		</div>
		<Users size={19} />
	</header>
	<div class="table-wrap">
		<table>
			<thead
				><tr><th>Member</th><th>Application role</th><th>Privy authority</th><th>Access</th></tr
				></thead
			><tbody
				>{#each team as member}<tr
						><td
							><div class="table-title">
								<span class="member-avatar"
									>{member.name
										.split(' ')
										.map((n) => n[0])
										.join('')}</span
								>
								<div><strong>{member.name}</strong><small>{member.email}</small></div>
							</div></td
						><td><span class="role-pill">{member.role}</span></td><td
							><strong>{member.reviewer}</strong></td
						><td><span class="healthy-dot"></span> Active</td></tr
					>{/each}</tbody
			>
		</table>
	</div>
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
