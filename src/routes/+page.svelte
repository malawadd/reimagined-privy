<script lang="ts">
	import {
		ArrowRight,
		BadgeCheck,
		Building2,
		Check,
		ChevronRight,
		CircleDollarSign,
		FileText,
		Landmark,
		LockKeyhole,
		ReceiptText,
		RefreshCw,
		ShieldCheck,
		Users,
		WalletCards,
		Workflow,
		Zap
	} from '@lucide/svelte';

	const workflows = [
		{
			icon: WalletCards,
			title: 'Treasury accounts',
			copy: 'Monitor organization wallets and supported assets from one operating view.'
		},
		{
			icon: CircleDollarSign,
			title: 'Payments and payouts',
			copy: 'Draft, review, and execute onchain payments with a complete status trail.'
		},
		{
			icon: FileText,
			title: 'Invoices and collections',
			copy: 'Issue requests, watch dedicated collection addresses, and reconcile deposits.'
		},
		{
			icon: ReceiptText,
			title: 'Bills and expenses',
			copy: 'Capture payables, assign owners, and route high-risk movement for review.'
		},
		{
			icon: Workflow,
			title: 'Approval controls',
			copy: 'Explain the required quorum while Privy remains the final policy authority.'
		},
		{
			icon: RefreshCw,
			title: 'Reconciliation',
			copy: 'Link operational records, provider events, and transaction evidence.'
		}
	];

	const controls = [
		'Organization-scoped access and roles',
		'Privy reviewer quorums with MFA',
		'Default-deny signer policies',
		'At-most-once provider execution',
		'Append-only audit evidence'
	];
</script>

<svelte:head>
	<title>Ratib | Digital asset finance operations</title>
	<meta
		name="description"
		content="Ratib brings wallets, payments, approvals, invoicing, automation, and reconciliation into one controlled finance workspace."
	/>
</svelte:head>

<header class="site-nav">
	<a class="landing-brand" href="/" aria-label="Ratib home"><span>R</span><strong>RATIB</strong></a>
	<nav aria-label="Primary navigation">
		<a href="#workflows">Workflows</a><a href="#controls">Controls</a><a href="#platform"
			>Platform</a
		>
	</nav>
	<div class="nav-actions">
		<a href="/login">Sign in</a><a class="nav-cta" href="/login"
			>Open workspace <ArrowRight size={15} /></a
		>
	</div>
</header>

<main class="landing">
	<section class="hero">
		<div class="hero-grid" aria-hidden="true"></div>
		<div class="hero-copy">
			<p class="hero-kicker"><span></span> Controlled pilot · Base Sepolia</p>
			<h1>Ratib</h1>
			<p class="hero-offer">Finance operations for businesses moving digital assets.</p>
			<p class="hero-detail">
				Bring treasury wallets, payments, approvals, invoices, automation, and reporting into one
				governed operating system.
			</p>
			<div class="hero-actions">
				<a class="hero-primary" href="/login">Enter Ratib <ArrowRight size={17} /></a><a
					href="#workflows">Explore workflows <ChevronRight size={17} /></a
				>
			</div>
		</div>
		<div class="product-scene" aria-label="Ratib workspace preview">
			<div class="scene-sidebar">
				<div class="scene-brand"><span>R</span> RATIB</div>
				<small>WORKSPACE</small><b><Building2 size={14} /> Organization</b>
				{#each ['Overview', 'Wallets', 'Payments', 'Approvals', 'Invoices', 'Reconciliation'] as item}<i
						>{item}</i
					>{/each}
			</div>
			<div class="scene-main">
				<div class="scene-top"><span>Finance operations</span><b>PRIVY CONTROLLED</b></div>
				<div class="scene-heading">
					<div><small>ORGANIZATION OVERVIEW</small><strong>Live workspace</strong></div>
					<button>New payment <ArrowRight size={13} /></button>
				</div>
				<div class="scene-stats">
					<div>
						<WalletCards size={17} /><span>Treasury balance</span><strong>Connect to load</strong>
					</div>
					<div>
						<ShieldCheck size={17} /><span>Approval authority</span><strong>Privy quorum</strong>
					</div>
					<div><Zap size={17} /><span>Automation status</span><strong>Policy bound</strong></div>
				</div>
				<div class="scene-table">
					<header><strong>Operations</strong><span>Status</span></header>
					<p>
						<LockKeyhole size={17} /><span>Authenticate to load organization-scoped activity.</span
						><b>LIVE DATA</b>
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="proof-strip" aria-label="Platform foundations">
		<span>Powered by</span><strong>PRIVY</strong><i></i><strong>CONVEX</strong><i></i><strong
			>BASE</strong
		>
		<p>Non-custodial controls · Realtime operations · Onchain settlement</p>
	</section>

	<section class="workflow-section" id="workflows">
		<div class="section-intro">
			<p>THE OPERATING LAYER</p>
			<h2>One place for the work around every transaction.</h2>
			<span
				>Ratib connects the financial record, human decision, wallet control, and onchain result so
				teams can operate without stitching together spreadsheets and wallet tabs.</span
			>
		</div>
		<div class="workflow-grid">
			{#each workflows as workflow}<article>
					<workflow.icon size={21} />
					<h3>{workflow.title}</h3>
					<p>{workflow.copy}</p>
					<a href="/login">View in workspace <ArrowRight size={14} /></a>
				</article>{/each}
		</div>
	</section>

	<section class="control-section" id="controls">
		<div class="control-copy">
			<p>BUILT AROUND AUTHORITY</p>
			<h2>Ratib coordinates. Privy authorizes.</h2>
			<span
				>Application roles decide who can prepare and inspect work. Privy ownership, signer
				policies, and reviewer quorums decide what can actually execute.</span
			>
			<ul>
				{#each controls as control}<li><Check size={16} />{control}</li>{/each}
			</ul>
		</div>
		<div class="control-diagram">
			<div>
				<small>01 · REQUEST</small><strong>Finance operator</strong><span
					>Creates an organization-scoped operation</span
				>
			</div>
			<ChevronRight size={18} />
			<div>
				<small>02 · CONTROL</small><strong>Ratib policy preview</strong><span
					>Explains route, quorum, and evidence</span
				>
			</div>
			<ChevronRight size={18} />
			<div class="privy-node">
				<small>03 · AUTHORITY</small><strong><ShieldCheck size={18} /> Privy</strong><span
					>Signs or holds for reviewer approval</span
				>
			</div>
			<ChevronRight size={18} />
			<div>
				<small>04 · RECORD</small><strong>Convex ledger</strong><span
					>Reconciles status and audit history</span
				>
			</div>
		</div>
	</section>

	<section class="platform-section" id="platform">
		<div>
			<p>DESIGNED FOR REAL OPERATIONS</p>
			<h2>From first wallet to the monthly close.</h2>
		</div>
		<div class="platform-points">
			<article>
				<Landmark size={22} /><strong>Treasury clarity</strong><span
					>Balances, accounts, payment activity, and funding requirements in context.</span
				>
			</article>
			<article>
				<Users size={22} /><strong>Team accountability</strong><span
					>Business roles, owners, reviewers, and automation actors remain distinct.</span
				>
			</article>
			<article>
				<BadgeCheck size={22} /><strong>Evidence by default</strong><span
					>Every operation retains its intent, provider reference, and settlement result.</span
				>
			</article>
		</div>
	</section>

	<section class="closing">
		<p>RATIB FINANCE OS</p>
		<h2>Operate digital assets like a finance team.</h2>
		<a href="/login">Open your workspace <ArrowRight size={17} /></a>
	</section>
</main>

<footer class="site-footer">
	<a class="landing-brand" href="/"><span>R</span><strong>RATIB</strong></a>
	<p>Digital asset finance operations for controlled-pilot businesses.</p>
	<div><a href="/login">Sign in</a><a href="#controls">Security model</a></div>
</footer>

<style>
	:global(body) {
		background: #f4f7f7;
	}
	.site-nav {
		position: fixed;
		z-index: 30;
		inset: 0 0 auto;
		display: grid;
		height: 72px;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		border-bottom: 1px solid rgba(207, 221, 221, 0.8);
		padding: 0 clamp(22px, 5vw, 76px);
		background: rgba(248, 251, 250, 0.92);
		backdrop-filter: blur(14px);
	}
	.landing-brand {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		gap: 10px;
	}
	.landing-brand span {
		display: grid;
		width: 31px;
		height: 31px;
		place-items: center;
		border-radius: 6px;
		color: white;
		background: #143c4d;
		font-family: Georgia, serif;
	}
	.landing-brand strong {
		font-size: 0.76rem;
		letter-spacing: 0.16em;
	}
	.site-nav nav {
		display: flex;
		gap: 30px;
		color: #52656d;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.nav-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 20px;
		font-size: 0.75rem;
		font-weight: 750;
	}
	.nav-cta,
	.hero-primary,
	.closing a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: white;
		background: #123d4c;
	}
	.nav-cta {
		height: 38px;
		padding: 0 16px;
		border-radius: 5px;
	}
	.hero {
		position: relative;
		min-height: min(900px, 92vh);
		overflow: hidden;
		padding: 138px clamp(22px, 7vw, 110px) 0;
		color: white;
		background: #0c2e3f;
	}
	.hero-grid {
		position: absolute;
		inset: 0;
		opacity: 0.14;
		background-image:
			linear-gradient(#9bb3bb 1px, transparent 1px),
			linear-gradient(90deg, #9bb3bb 1px, transparent 1px);
		background-size: 54px 54px;
		mask-image: linear-gradient(to bottom, black, transparent 76%);
	}
	.hero-copy {
		position: relative;
		z-index: 2;
		max-width: 830px;
	}
	.hero-kicker {
		display: flex;
		align-items: center;
		gap: 9px;
		color: #a8c1c8;
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.1em;
	}
	.hero-kicker span {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #5ad0a2;
	}
	.hero h1 {
		margin-top: 18px;
		font-family: Georgia, serif;
		font-size: clamp(5rem, 11vw, 9.5rem);
		font-weight: 400;
		line-height: 0.86;
		letter-spacing: 0;
	}
	.hero-offer {
		margin-top: 28px;
		font-family: Georgia, serif;
		font-size: clamp(1.9rem, 4vw, 3.35rem);
		line-height: 1.08;
	}
	.hero-detail {
		max-width: 680px;
		margin-top: 20px;
		color: #b8cbd0;
		font-size: 1.02rem;
		line-height: 1.7;
	}
	.hero-actions {
		display: flex;
		align-items: center;
		gap: 25px;
		margin-top: 30px;
		font-size: 0.8rem;
		font-weight: 800;
	}
	.hero-actions > a {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.hero-primary {
		height: 46px;
		padding: 0 20px;
		border: 1px solid #d9eeee;
		border-radius: 5px;
		color: #123642;
		background: #f3fbf9;
	}
	.product-scene {
		position: relative;
		z-index: 3;
		display: grid;
		width: min(1080px, 92vw);
		min-height: 350px;
		grid-template-columns: 190px 1fr;
		margin: 62px auto -65px;
		overflow: hidden;
		border: 1px solid #57727d;
		border-bottom: 0;
		border-radius: 7px 7px 0 0;
		color: #23353d;
		background: #f7f9fa;
		box-shadow: 0 28px 80px rgba(0, 0, 0, 0.28);
	}
	.scene-sidebar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-right: 1px solid #dbe3e5;
		padding: 22px 16px;
		background: #eef3f4;
	}
	.scene-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 25px;
		font-size: 0.65rem;
		font-weight: 900;
		letter-spacing: 0.12em;
	}
	.scene-brand span {
		display: grid;
		width: 25px;
		height: 25px;
		place-items: center;
		border-radius: 5px;
		color: white;
		background: #143c4d;
	}
	.scene-sidebar small {
		margin: 8px 8px 2px;
		color: #88979d;
		font-size: 0.54rem;
		letter-spacing: 0.12em;
	}
	.scene-sidebar b,
	.scene-sidebar i {
		display: flex;
		height: 31px;
		align-items: center;
		gap: 8px;
		border-radius: 4px;
		padding: 0 9px;
		font-size: 0.65rem;
		font-style: normal;
	}
	.scene-sidebar b {
		color: #194454;
		background: #dce9eb;
	}
	.scene-sidebar i {
		color: #66767c;
	}
	.scene-main {
		min-width: 0;
		padding: 0 24px 24px;
	}
	.scene-top {
		display: flex;
		height: 48px;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #dee6e8;
		color: #7b8a90;
		font-size: 0.62rem;
	}
	.scene-top b {
		color: #28715b;
		font-size: 0.55rem;
		letter-spacing: 0.08em;
	}
	.scene-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		padding: 28px 0 20px;
	}
	.scene-heading small,
	.scene-heading strong {
		display: block;
	}
	.scene-heading small {
		color: #73858c;
		font-size: 0.53rem;
		letter-spacing: 0.1em;
	}
	.scene-heading strong {
		margin-top: 5px;
		font-family: Georgia, serif;
		font-size: 1.55rem;
		font-weight: 500;
	}
	.scene-heading button {
		display: flex;
		height: 34px;
		align-items: center;
		gap: 7px;
		border: 0;
		border-radius: 4px;
		padding: 0 12px;
		color: white;
		background: #143f4e;
		font-size: 0.61rem;
		font-weight: 700;
	}
	.scene-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid #dce4e6;
		background: white;
	}
	.scene-stats div {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 4px 9px;
		border-right: 1px solid #dce4e6;
		padding: 16px;
	}
	.scene-stats div:last-child {
		border: 0;
	}
	.scene-stats :global(svg) {
		grid-row: 1 / 3;
		color: #3d7480;
	}
	.scene-stats span {
		color: #7b8b91;
		font-size: 0.55rem;
	}
	.scene-stats strong {
		font-size: 0.74rem;
	}
	.scene-table {
		margin-top: 16px;
		border: 1px solid #dce4e6;
		background: white;
	}
	.scene-table header,
	.scene-table p {
		display: flex;
		align-items: center;
	}
	.scene-table header {
		justify-content: space-between;
		border-bottom: 1px solid #e2e8ea;
		padding: 11px 14px;
		font-size: 0.61rem;
	}
	.scene-table header span {
		color: #89969b;
	}
	.scene-table p {
		gap: 9px;
		padding: 26px 14px;
		color: #718087;
		font-size: 0.62rem;
	}
	.scene-table p b {
		margin-left: auto;
		color: #2b7b61;
		font-size: 0.52rem;
		letter-spacing: 0.08em;
	}
	.proof-strip {
		display: flex;
		min-height: 92px;
		align-items: center;
		gap: 24px;
		padding: 45px clamp(22px, 6vw, 90px) 0;
		color: #607078;
		background: #edf3f2;
		font-size: 0.68rem;
	}
	.proof-strip > span {
		text-transform: uppercase;
	}
	.proof-strip strong {
		color: #173d4b;
		letter-spacing: 0.1em;
	}
	.proof-strip i {
		width: 1px;
		height: 18px;
		background: #cbd8d7;
	}
	.proof-strip p {
		margin-left: auto;
	}
	.workflow-section,
	.control-section,
	.platform-section {
		padding: 110px clamp(22px, 7vw, 110px);
	}
	.section-intro {
		display: grid;
		grid-template-columns: 1fr 1.35fr;
		gap: 18px 60px;
		max-width: 1180px;
	}
	.section-intro p,
	.control-copy > p,
	.platform-section > div > p,
	.closing > p {
		color: #37806b;
		font-size: 0.66rem;
		font-weight: 850;
		letter-spacing: 0.12em;
	}
	.section-intro h2 {
		grid-column: 1;
		font-family: Georgia, serif;
		font-size: clamp(2.3rem, 4vw, 4rem);
		font-weight: 400;
		line-height: 1.05;
	}
	.section-intro > span {
		grid-column: 2;
		grid-row: 2;
		max-width: 570px;
		color: #68777d;
		line-height: 1.75;
	}
	.workflow-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		max-width: 1180px;
		margin-top: 60px;
		border-top: 1px solid #ccd8da;
		border-left: 1px solid #ccd8da;
	}
	.workflow-grid article {
		min-height: 235px;
		border-right: 1px solid #ccd8da;
		border-bottom: 1px solid #ccd8da;
		padding: 28px;
		background: #f8fafa;
	}
	.workflow-grid :global(svg) {
		color: #2f7461;
	}
	.workflow-grid h3 {
		margin-top: 28px;
		font-family: Georgia, serif;
		font-size: 1.25rem;
		font-weight: 500;
	}
	.workflow-grid p {
		margin-top: 10px;
		color: #6b7a80;
		font-size: 0.82rem;
		line-height: 1.65;
	}
	.workflow-grid a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 23px;
		color: #174657;
		font-size: 0.68rem;
		font-weight: 800;
	}
	.control-section {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		gap: 80px;
		color: white;
		background: #123746;
	}
	.control-copy h2 {
		margin-top: 16px;
		font-family: Georgia, serif;
		font-size: clamp(2.3rem, 4vw, 4rem);
		font-weight: 400;
		line-height: 1.05;
	}
	.control-copy > span {
		display: block;
		margin-top: 24px;
		color: #b8c9cf;
		line-height: 1.75;
	}
	.control-copy ul {
		display: grid;
		gap: 12px;
		margin: 28px 0 0;
		padding: 0;
		list-style: none;
		color: #d5e0e3;
		font-size: 0.8rem;
	}
	.control-copy li {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.control-copy li :global(svg) {
		color: #5fd0a3;
	}
	.control-diagram {
		display: grid;
		align-content: center;
		gap: 10px;
	}
	.control-diagram > div {
		border: 1px solid #496774;
		padding: 18px 20px;
		background: #173f4e;
	}
	.control-diagram > :global(svg) {
		justify-self: center;
		transform: rotate(90deg);
		color: #78919a;
	}
	.control-diagram small,
	.control-diagram strong,
	.control-diagram span {
		display: block;
	}
	.control-diagram small {
		color: #7fa0aa;
		font-size: 0.54rem;
		letter-spacing: 0.1em;
	}
	.control-diagram strong {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 7px;
		font-family: Georgia, serif;
		font-size: 1.05rem;
	}
	.control-diagram span {
		margin-top: 4px;
		color: #a9bec5;
		font-size: 0.68rem;
	}
	.control-diagram .privy-node {
		border-color: #68bba0;
		background: #194c4c;
	}
	.platform-section {
		display: grid;
		grid-template-columns: 0.7fr 1.3fr;
		gap: 70px;
		background: #eef3f2;
	}
	.platform-section h2 {
		max-width: 450px;
		margin-top: 15px;
		font-family: Georgia, serif;
		font-size: clamp(2.2rem, 4vw, 3.8rem);
		font-weight: 400;
		line-height: 1.05;
	}
	.platform-points {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 30px;
		align-content: end;
	}
	.platform-points article {
		border-top: 2px solid #244e5c;
		padding-top: 20px;
	}
	.platform-points :global(svg) {
		color: #35735f;
	}
	.platform-points strong,
	.platform-points span {
		display: block;
	}
	.platform-points strong {
		margin-top: 22px;
		font-family: Georgia, serif;
		font-size: 1.1rem;
	}
	.platform-points span {
		margin-top: 9px;
		color: #69797f;
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.closing {
		padding: 120px 22px;
		text-align: center;
		background: #fafcfc;
	}
	.closing h2 {
		margin: 18px auto 30px;
		font-family: Georgia, serif;
		font-size: clamp(2.5rem, 5vw, 4.7rem);
		font-weight: 400;
	}
	.closing a {
		width: fit-content;
		height: 47px;
		margin: 0 auto;
		border-radius: 5px;
		padding: 0 20px;
		font-size: 0.78rem;
		font-weight: 800;
	}
	.site-footer {
		display: flex;
		min-height: 120px;
		align-items: center;
		gap: 28px;
		border-top: 1px solid #dce4e5;
		padding: 30px clamp(22px, 6vw, 90px);
		background: #f4f7f7;
	}
	.site-footer p {
		color: #738187;
		font-size: 0.72rem;
	}
	.site-footer div {
		display: flex;
		gap: 24px;
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 750;
	}
	@media (max-width: 900px) {
		.site-nav {
			grid-template-columns: 1fr auto;
		}
		.site-nav nav {
			display: none;
		}
		.hero {
			min-height: 850px;
			padding-top: 125px;
		}
		.product-scene {
			grid-template-columns: 150px 1fr;
		}
		.proof-strip p {
			display: none;
		}
		.section-intro,
		.control-section,
		.platform-section {
			grid-template-columns: 1fr;
		}
		.section-intro > span {
			grid-column: 1;
			grid-row: auto;
		}
		.workflow-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 620px) {
		.site-nav {
			height: 64px;
		}
		.nav-actions > a:first-child {
			display: none;
		}
		.nav-cta {
			height: 36px;
			padding: 0 12px;
		}
		.hero {
			min-height: 790px;
			padding-top: 108px;
		}
		.hero h1 {
			font-size: 5rem;
		}
		.hero-actions {
			align-items: flex-start;
			flex-direction: column;
			gap: 15px;
		}
		.product-scene {
			width: 760px;
			margin-top: 44px;
			margin-left: 8px;
			transform: scale(0.66);
			transform-origin: top left;
		}
		.proof-strip {
			flex-wrap: wrap;
			gap: 14px;
			padding-top: 30px;
		}
		.workflow-section,
		.control-section,
		.platform-section {
			padding-top: 78px;
			padding-bottom: 78px;
		}
		.workflow-grid,
		.platform-points {
			grid-template-columns: 1fr;
		}
		.workflow-grid article {
			min-height: 200px;
		}
		.site-footer {
			align-items: flex-start;
			flex-direction: column;
		}
		.site-footer div {
			margin-left: 0;
		}
	}
</style>
