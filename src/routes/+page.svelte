<script lang="ts">
	import {
		ArrowRight,
		BookOpenCheck,
		Check,
		ChevronRight,
		CircleDollarSign,
		FileText,
		Landmark,
		LockKeyhole,
		ShieldCheck,
		Users,
		WalletCards,
		Zap
	} from '@lucide/svelte';

	const workflows = [
		{
			icon: Landmark,
			title: 'Treasury',
			copy: 'See provider-backed wallets and supported assets in one operating view.',
			image: '/landing/workflow-treasury.webp'
		},
		{
			icon: CircleDollarSign,
			title: 'Payments',
			copy: 'Draft, review, and execute Base Sepolia payments with a complete status trail.',
			image: '/landing/workflow-payments.webp'
		},
		{
			icon: ShieldCheck,
			title: 'Approvals',
			copy: 'Understand the required quorum while Privy remains the final policy authority.',
			image: '/landing/workflow-approvals.webp'
		},
		{
			icon: BookOpenCheck,
			title: 'Reconciliation',
			copy: 'Connect operational records, provider events, and settlement evidence.',
			image: '/landing/workflow-reconciliation.webp'
		}
	];

	const capabilities = [
		'Invoices',
		'Bills & expenses',
		'Payroll',
		'Accounting',
		'Automation',
		'Developer API'
	];

	const authoritySteps = [
		{
			number: '01',
			label: 'Request',
			title: 'Finance operator',
			copy: 'Creates an organization-scoped operation.'
		},
		{
			number: '02',
			label: 'Policy preview',
			title: 'Ratib',
			copy: 'Explains the route, quorum, and evidence.'
		},
		{
			number: '03',
			label: 'Authority',
			title: 'Privy',
			copy: 'Authorizes, holds, or denies execution.',
			accent: true
		},
		{
			number: '04',
			label: 'Record',
			title: 'Convex ledger',
			copy: 'Reconciles status and append-only evidence.'
		}
	];

	const platformPoints = [
		{
			icon: WalletCards,
			title: 'Treasury clarity',
			copy: 'Balances, accounts, payment activity, and funding requirements stay in context.'
		},
		{
			icon: Users,
			title: 'Team accountability',
			copy: 'Business roles, owners, reviewers, and automation actors remain distinct.'
		},
		{
			icon: ShieldCheck,
			title: 'Evidence by default',
			copy: 'Every operation retains its intent, provider reference, and settlement result.'
		}
	];
</script>

<svelte:head>
	<title>Ratib | Finance operations for digital assets</title>
	<meta
		name="description"
		content="Ratib brings wallets, payments, approvals, invoicing, automation, and reporting into one governed finance operations workspace."
	/>
	<link rel="preload" as="image" href="/landing/hero-city.webp" media="(min-width: 621px)" />
	<link rel="preload" as="image" href="/landing/hero-city-mobile.webp" media="(max-width: 620px)" />
</svelte:head>

<header class="site-nav">
	<a class="landing-brand" href="/" aria-label="Ratib home">
		<span>R</span><strong>RATIB</strong>
	</a>
	<nav aria-label="Primary navigation">
		<a href="#workflows">Workflows</a>
		<a href="#controls">Controls</a>
		<a href="#platform">Platform</a>
	</nav>
	<div class="nav-actions">
		<a class="sign-in" href="/login">Sign in</a>
		<a class="nav-cta" href="/login">Enter Ratib <ArrowRight size={15} /></a>
	</div>
</header>

<main class="landing">
	<section class="hero" aria-labelledby="hero-title">
		<picture class="hero-world" aria-hidden="true">
			<source media="(max-width: 620px)" srcset="/landing/hero-city-mobile.webp" />
			<img src="/landing/hero-city.webp" alt="" width="1730" height="909" fetchpriority="high" />
		</picture>
		<div class="hero-wash" aria-hidden="true"></div>
		<div class="paint paint-one" aria-hidden="true"></div>
		<div class="paint paint-two" aria-hidden="true"></div>
		<img
			class="hero-flora hero-flora-left"
			src="/landing/flora-left.webp"
			alt=""
			width="920"
			height="965"
			aria-hidden="true"
		/>
		<img
			class="hero-flora hero-flora-right"
			src="/landing/flora-right.webp"
			alt=""
			width="900"
			height="966"
			aria-hidden="true"
		/>

		<div class="hero-layout">
			<div class="hero-copy">
				<p class="hero-kicker"><span></span> Live on Base Sepolia · Privy-controlled</p>
				<h1 id="hero-title">Finance operations for businesses <em>moving digital assets.</em></h1>
				<p class="hero-detail">
					Bring wallets, payments, approvals, invoices, automation, and reporting into one governed
					operating system.
				</p>
				<div class="hero-actions">
					<a class="button-primary" href="/login">Enter Ratib <ArrowRight size={17} /></a>
					<a class="button-link" href="#workflows">Explore workflows <ChevronRight size={17} /></a>
				</div>
				<p class="hero-truth">
					<LockKeyhole size={14} /> Base Sepolia testnet · No mainnet fallback
				</p>
			</div>

			<div
				class="product-scene"
				role="img"
				aria-label="Preview of the Ratib finance operations workspace"
			>
				<div class="scene-sidebar">
					<div class="scene-brand"><span>R</span> RATIB</div>
					<small>WORKSPACE</small>
					<b><Landmark size={14} /> Organization</b>
					{#each ['Overview', 'Wallets', 'Payments', 'Approvals', 'Reconciliation'] as item}
						<i>{item}</i>
					{/each}
				</div>
				<div class="scene-main">
					<div class="scene-top">
						<span>Finance operations</span><b><ShieldCheck size={11} /> Privy final authority</b>
					</div>
					<div class="scene-heading">
						<div><small>ORGANIZATION OVERVIEW</small><strong>Live workspace</strong></div>
						<span>New payment <ArrowRight size={13} /></span>
					</div>
					<div class="scene-stats">
						<div>
							<WalletCards size={17} /><span>Treasury state</span><strong>Live provider</strong>
						</div>
						<div>
							<ShieldCheck size={17} /><span>Approval authority</span><strong>Privy quorum</strong>
						</div>
						<div><Zap size={17} /><span>Automation</span><strong>Policy-bound</strong></div>
					</div>
					<div class="scene-table">
						<header><strong>Recent operations</strong><span>Status</span></header>
						<p>
							<CircleDollarSign size={16} /><span>Payment request</span><b>Pending approval</b>
						</p>
						<p>
							<FileText size={16} /><span>Invoice deposit</span><b class="success">Reconciled</b>
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="foundation-strip" aria-label="Platform foundations">
		<span>Powered by</span>
		<strong>PRIVY</strong><i></i><strong>CONVEX</strong><i></i><strong>BASE</strong>
		<p>Non-custodial controls · Realtime operations · Onchain settlement</p>
	</section>

	<section class="workflow-section" id="workflows" aria-labelledby="workflow-heading">
		<div class="section-intro">
			<div>
				<p class="eyebrow">THE OPERATING LAYER</p>
				<h2 id="workflow-heading">From treasury to reconciliation, <em>in one place.</em></h2>
			</div>
			<p class="section-copy">
				Ratib connects the financial record, human decision, wallet control, and onchain result so
				teams can operate without stitching together spreadsheets and wallet tabs.
			</p>
		</div>

		<div class="workflow-grid">
			{#each workflows as workflow, index}
				<article class="workflow-card">
					<div class="workflow-art">
						<img src={workflow.image} alt="" width="900" height="600" loading="lazy" />
						<span>0{index + 1}</span>
					</div>
					<div class="workflow-copy">
						<div class="workflow-icon"><workflow.icon size={19} /></div>
						<div>
							<h3>{workflow.title}</h3>
							<p>{workflow.copy}</p>
						</div>
						<a href="/login" aria-label={'Explore ' + workflow.title + ' in Ratib'}
							><ArrowRight size={17} /></a
						>
					</div>
				</article>
			{/each}
		</div>

		<div class="capability-rail" aria-label="Additional capabilities">
			<p>Everything around the transaction</p>
			<div>
				{#each capabilities as capability}<span><Check size={13} />{capability}</span>{/each}
			</div>
		</div>
	</section>

	<section class="control-section" id="controls" aria-labelledby="control-heading">
		<div class="control-copy">
			<p class="eyebrow light">BUILT AROUND AUTHORITY</p>
			<h2 id="control-heading">Ratib coordinates. <em>Privy authorizes.</em></h2>
			<p>
				Application roles determine who can prepare and inspect work. Wallet owners, signer
				policies, reviewer quorums, and MFA determine what can execute.
			</p>
			<div class="authority-note">
				<LockKeyhole size={17} /> Ratib roles never grant signing authority.
			</div>
		</div>

		<div class="authority-stage">
			<div class="authority-shade" aria-hidden="true"></div>
			<div class="authority-flow">
				{#each authoritySteps as step}
					<article class:accent={step.accent}>
						<small>{step.number} · {step.label}</small>
						<strong>{step.title}</strong>
						<span>{step.copy}</span>
					</article>
				{/each}
			</div>
		</div>
	</section>

	<section class="platform-section" id="platform" aria-labelledby="platform-heading">
		<div class="platform-heading">
			<p class="eyebrow">DESIGNED FOR REAL OPERATIONS</p>
			<h2 id="platform-heading">The control plane around <em>every transaction.</em></h2>
			<p>
				From the first wallet to the monthly close, operational state and authority remain visible
				together.
			</p>
		</div>
		<div class="platform-points">
			{#each platformPoints as point, index}
				<article>
					<span>0{index + 1}</span>
					<point.icon size={22} />
					<h3>{point.title}</h3>
					<p>{point.copy}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="closing" aria-labelledby="closing-heading">
		<div class="closing-orbit" aria-hidden="true"></div>
		<img
			class="closing-flora"
			src="/landing/flora-right.webp"
			alt=""
			width="900"
			height="966"
			loading="lazy"
			aria-hidden="true"
		/>
		<div>
			<p class="eyebrow light">RATIB FINANCE OS</p>
			<h2 id="closing-heading">Operate digital assets <em>like a finance team.</em></h2>
			<a href="/login">Open your workspace <ArrowRight size={17} /></a>
		</div>
	</section>
</main>

<footer class="site-footer">
	<a class="landing-brand" href="/" aria-label="Ratib home"><span>R</span><strong>RATIB</strong></a>
	<p>Governed finance operations for businesses moving digital assets.</p>
	<div><a href="/login">Sign in</a><a href="#controls">Security model</a></div>
</footer>

<style>
	:global(body) {
		background: #f7f1e8;
	}
	:global(html) {
		scroll-behavior: smooth;
	}
	.landing {
		--ink: #062f35;
		--teal: #073f43;
		--cream: #f7f1e8;
		--paper: #fffdf8;
		--line: rgba(6, 47, 53, 0.17);
		--lime: #c9f528;
		color: var(--ink);
		background: var(--cream);
	}
	.site-nav {
		position: fixed;
		z-index: 50;
		top: 0;
		left: 50%;
		display: grid;
		width: min(1420px, calc(100% - 36px));
		height: 74px;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		margin-top: 14px;
		border: 1px solid rgba(255, 255, 255, 0.74);
		border-radius: 10px;
		padding: 0 18px 0 22px;
		background: rgba(255, 253, 248, 0.9);
		box-shadow: 0 12px 38px rgba(14, 54, 55, 0.1);
		backdrop-filter: blur(18px);
		transform: translateX(-50%);
	}
	.landing-brand {
		display: inline-flex;
		width: fit-content;
		align-items: center;
		gap: 11px;
	}
	.landing-brand span {
		display: grid;
		width: 33px;
		height: 33px;
		place-items: center;
		border-radius: 50%;
		color: white;
		background: var(--teal, #073f43);
		font-family: Georgia, Cambria, 'Times New Roman', serif;
		font-size: 1rem;
	}
	.landing-brand strong {
		font-size: 0.8rem;
		font-weight: 900;
		letter-spacing: 0.18em;
	}
	.site-nav nav,
	.nav-actions,
	.hero-actions {
		display: flex;
		align-items: center;
	}
	.site-nav nav {
		gap: 32px;
		color: #385d5e;
		font-size: 0.76rem;
		font-weight: 750;
	}
	.nav-actions {
		justify-content: flex-end;
		gap: 20px;
		font-size: 0.75rem;
		font-weight: 800;
	}
	.nav-cta,
	.button-primary,
	.closing a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		color: white;
		background: var(--teal, #073f43);
		box-shadow: 0 8px 24px rgba(5, 47, 52, 0.17);
	}
	.nav-cta {
		height: 42px;
		border-radius: 7px;
		padding: 0 17px;
	}
	.site-nav nav a,
	.sign-in {
		transition: color 0.18s ease;
	}
	.site-nav nav a:hover,
	.sign-in:hover {
		color: #0b8b79;
	}
	.site-nav a:focus-visible,
	.landing a:focus-visible,
	.site-footer a:focus-visible {
		outline: 3px solid #7565ff;
		outline-offset: 3px;
	}
	.hero {
		position: relative;
		min-height: 980px;
		overflow: hidden;
		padding: 128px clamp(20px, 4vw, 70px) 80px;
		isolation: isolate;
	}
	.hero-world,
	.hero-world img,
	.hero-wash {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.hero-world {
		z-index: -4;
	}
	.hero-world img {
		object-fit: cover;
		object-position: center;
	}
	.hero-wash {
		z-index: -3;
		background:
			linear-gradient(
				90deg,
				rgba(255, 248, 238, 0.97) 0%,
				rgba(255, 248, 238, 0.86) 34%,
				rgba(255, 248, 238, 0.08) 70%
			),
			linear-gradient(0deg, rgba(247, 241, 232, 0.86) 0%, transparent 30%);
	}
	.paint {
		position: absolute;
		z-index: 1;
		width: 270px;
		height: 17px;
		background: var(--lime);
		clip-path: polygon(1% 44%, 100% 0, 92% 68%, 9% 100%);
		transform: rotate(-4deg);
	}
	.paint-one {
		top: 426px;
		left: clamp(30px, 16vw, 270px);
	}
	.paint-two {
		right: 4%;
		bottom: 80px;
		width: 170px;
		transform: rotate(-9deg);
	}
	.hero-flora {
		position: absolute;
		z-index: 2;
		height: auto;
		pointer-events: none;
		filter: drop-shadow(0 22px 25px rgba(25, 62, 42, 0.17));
	}
	.hero-flora-left {
		bottom: -220px;
		left: -150px;
		width: min(44vw, 650px);
		animation: settle-left 0.9s ease-out both;
	}
	.hero-flora-right {
		right: -135px;
		bottom: -210px;
		width: min(35vw, 520px);
		animation: settle-right 1s 0.08s ease-out both;
	}
	.hero-layout {
		position: relative;
		z-index: 3;
		display: grid;
		max-width: 1420px;
		grid-template-columns: minmax(0, 0.92fr) minmax(520px, 0.88fr);
		align-items: center;
		gap: clamp(28px, 4vw, 70px);
		margin: 0 auto;
	}
	.hero-copy {
		padding: 36px 0 95px;
		animation: rise-in 0.75s ease-out both;
	}
	.hero-kicker,
	.hero-truth {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 0.67rem;
		font-weight: 850;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.hero-kicker span {
		width: 8px;
		height: 8px;
		border: 2px solid white;
		border-radius: 50%;
		background: #7667ff;
		box-shadow: 0 0 0 2px #7667ff;
	}
	.hero h1,
	.section-intro h2,
	.control-copy h2,
	.platform-heading h2,
	.closing h2 {
		font-family: Georgia, Cambria, 'Times New Roman', serif;
		font-weight: 400;
		letter-spacing: -0.055em;
	}
	.hero h1 {
		max-width: 760px;
		margin-top: 24px;
		font-size: clamp(4rem, 6.4vw, 7rem);
		line-height: 0.87;
	}
	.hero h1 em,
	.section-intro h2 em,
	.control-copy h2 em,
	.platform-heading h2 em,
	.closing h2 em {
		font-style: italic;
	}
	.hero-detail {
		max-width: 610px;
		margin-top: 27px;
		color: #264f51;
		font-size: 1rem;
		line-height: 1.65;
	}
	.hero-actions {
		gap: 25px;
		margin-top: 28px;
		font-size: 0.77rem;
		font-weight: 850;
	}
	.button-primary {
		height: 48px;
		border-radius: 7px;
		padding: 0 20px;
	}
	.button-link {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.hero-truth {
		width: fit-content;
		margin-top: 22px;
		border-radius: 999px;
		padding: 8px 11px;
		color: #3c5d5d;
		background: rgba(255, 253, 248, 0.72);
		letter-spacing: 0.03em;
		text-transform: none;
		backdrop-filter: blur(8px);
	}
	.product-scene {
		display: grid;
		min-height: 480px;
		grid-template-columns: 150px 1fr;
		overflow: hidden;
		border: 10px solid rgba(255, 253, 248, 0.88);
		border-radius: 18px;
		color: #17383b;
		background: #f8faf8;
		box-shadow: 0 42px 90px rgba(6, 40, 43, 0.29);
		transform: rotate(0.8deg);
		animation: scene-in 0.9s 0.08s ease-out both;
	}
	.scene-sidebar {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 22px 14px;
		color: #cfe2de;
		background: #073f43;
	}
	.scene-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 24px;
		color: white;
		font-size: 0.65rem;
		font-weight: 900;
		letter-spacing: 0.12em;
	}
	.scene-brand span {
		display: grid;
		width: 24px;
		height: 24px;
		place-items: center;
		border-radius: 50%;
		color: #073f43;
		background: var(--lime);
	}
	.scene-sidebar small {
		margin: 7px 8px 2px;
		color: #78a19b;
		font-size: 0.51rem;
		letter-spacing: 0.12em;
	}
	.scene-sidebar b,
	.scene-sidebar i {
		display: flex;
		height: 31px;
		align-items: center;
		gap: 7px;
		border-radius: 6px;
		padding: 0 8px;
		font-size: 0.6rem;
		font-style: normal;
	}
	.scene-sidebar b {
		color: white;
		background: #166760;
	}
	.scene-main {
		min-width: 0;
		padding: 0 20px 20px;
		background:
			radial-gradient(circle at 100% 0%, rgba(201, 245, 40, 0.12), transparent 30%), #f8faf8;
	}
	.scene-top,
	.scene-heading,
	.scene-table header,
	.scene-table p {
		display: flex;
		align-items: center;
	}
	.scene-top {
		height: 47px;
		justify-content: space-between;
		border-bottom: 1px solid #dfe8e4;
		color: #718783;
		font-size: 0.58rem;
	}
	.scene-top b {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: #11675a;
		font-size: 0.51rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.scene-heading {
		justify-content: space-between;
		padding: 25px 0 18px;
	}
	.scene-heading small,
	.scene-heading strong {
		display: block;
	}
	.scene-heading small {
		color: #718783;
		font-size: 0.48rem;
		letter-spacing: 0.12em;
	}
	.scene-heading strong {
		margin-top: 5px;
		font-family: Georgia, Cambria, serif;
		font-size: 1.45rem;
		font-weight: 500;
	}
	.scene-heading > span {
		display: flex;
		height: 33px;
		align-items: center;
		gap: 6px;
		border-radius: 5px;
		padding: 0 11px;
		color: white;
		background: #073f43;
		font-size: 0.58rem;
		font-weight: 750;
	}
	.scene-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid #dce5e1;
		border-radius: 8px;
		background: white;
	}
	.scene-stats div {
		display: grid;
		min-width: 0;
		grid-template-columns: auto 1fr;
		gap: 4px 8px;
		border-right: 1px solid #dce5e1;
		padding: 15px 11px;
	}
	.scene-stats div:last-child {
		border: 0;
	}
	.scene-stats :global(svg) {
		grid-row: 1 / 3;
		color: #27786c;
	}
	.scene-stats span {
		color: #778985;
		font-size: 0.5rem;
	}
	.scene-stats strong {
		overflow: hidden;
		font-size: 0.64rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.scene-table {
		margin-top: 14px;
		border: 1px solid #dce5e1;
		border-radius: 8px;
		background: white;
	}
	.scene-table header {
		justify-content: space-between;
		border-bottom: 1px solid #e3e9e6;
		padding: 11px 13px;
		font-size: 0.57rem;
	}
	.scene-table header span {
		color: #83928f;
	}
	.scene-table p {
		gap: 8px;
		border-bottom: 1px solid #eef1ef;
		padding: 15px 13px;
		color: #687d79;
		font-size: 0.57rem;
	}
	.scene-table p:last-child {
		border: 0;
	}
	.scene-table p b {
		margin-left: auto;
		border-radius: 99px;
		padding: 5px 7px;
		color: #916315;
		background: #fff3d4;
		font-size: 0.49rem;
	}
	.scene-table p b.success {
		color: #176b4c;
		background: #e7f6ed;
	}
	.foundation-strip {
		display: flex;
		min-height: 92px;
		align-items: center;
		gap: 23px;
		border-top: 1px solid rgba(255, 255, 255, 0.6);
		border-bottom: 1px solid #d6ddd5;
		padding: 20px clamp(22px, 6vw, 92px);
		color: #56716f;
		background: #fffdf8;
		font-size: 0.68rem;
	}
	.foundation-strip > span {
		text-transform: uppercase;
	}
	.foundation-strip strong {
		color: var(--ink);
		letter-spacing: 0.12em;
	}
	.foundation-strip i {
		width: 1px;
		height: 18px;
		background: #cbd5d0;
	}
	.foundation-strip p {
		margin-left: auto;
	}
	.workflow-section,
	.platform-section {
		padding: 120px clamp(22px, 7vw, 110px);
	}
	.section-intro {
		display: grid;
		max-width: 1320px;
		grid-template-columns: 1.05fr 0.75fr;
		align-items: end;
		gap: 70px;
		margin: 0 auto;
	}
	.eyebrow {
		color: #267969;
		font-size: 0.64rem;
		font-weight: 900;
		letter-spacing: 0.15em;
	}
	.eyebrow.light {
		color: #a7e7cf;
	}
	.section-intro h2,
	.control-copy h2,
	.platform-heading h2,
	.closing h2 {
		font-size: clamp(2.8rem, 5vw, 5.2rem);
		line-height: 0.98;
	}
	.section-intro h2 {
		max-width: 760px;
		margin-top: 18px;
	}
	.section-intro h2 em {
		color: #4274e8;
	}
	.section-copy {
		max-width: 520px;
		color: #5f7471;
		line-height: 1.75;
	}
	.workflow-grid {
		display: grid;
		max-width: 1320px;
		grid-template-columns: repeat(2, 1fr);
		gap: 22px;
		margin: 62px auto 0;
	}
	.workflow-card {
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: 13px;
		background: var(--paper);
		box-shadow: 0 18px 46px rgba(24, 63, 58, 0.08);
		transition:
			transform 0.25s ease,
			box-shadow 0.25s ease;
	}
	.workflow-card:hover {
		box-shadow: 0 26px 60px rgba(24, 63, 58, 0.14);
		transform: translateY(-5px);
	}
	.workflow-art {
		position: relative;
		aspect-ratio: 3 / 1.58;
		overflow: hidden;
		background: #dfe9e6;
	}
	.workflow-art img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.55s ease;
	}
	.workflow-card:hover .workflow-art img {
		transform: scale(1.035);
	}
	.workflow-art > span {
		position: absolute;
		top: 16px;
		left: 16px;
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.8);
		border-radius: 50%;
		color: white;
		background: rgba(5, 54, 55, 0.76);
		font-size: 0.63rem;
		font-weight: 900;
		backdrop-filter: blur(8px);
	}
	.workflow-copy {
		display: grid;
		min-height: 128px;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 16px;
		padding: 22px;
	}
	.workflow-icon,
	.workflow-copy > a {
		display: grid;
		place-items: center;
		border-radius: 50%;
	}
	.workflow-icon {
		width: 43px;
		height: 43px;
		color: white;
		background: var(--teal);
	}
	.workflow-copy h3 {
		font-family: Georgia, Cambria, serif;
		font-size: 1.45rem;
		font-weight: 500;
	}
	.workflow-copy p {
		max-width: 420px;
		margin-top: 6px;
		color: #657875;
		font-size: 0.77rem;
		line-height: 1.55;
	}
	.workflow-copy > a {
		width: 38px;
		height: 38px;
		border: 1px solid #c9d4cf;
		transition:
			color 0.18s ease,
			background 0.18s ease;
	}
	.workflow-copy > a:hover {
		color: white;
		background: var(--teal);
	}
	.capability-rail {
		display: grid;
		max-width: 1320px;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 30px;
		margin: 34px auto 0;
		border-top: 1px solid var(--line);
		border-bottom: 1px solid var(--line);
		padding: 20px 0;
	}
	.capability-rail > p {
		font-family: Georgia, Cambria, serif;
		font-size: 1.02rem;
		font-style: italic;
	}
	.capability-rail > div {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}
	.capability-rail span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid #cdd8d2;
		border-radius: 999px;
		padding: 8px 11px;
		color: #466662;
		background: #fffdf8;
		font-size: 0.66rem;
		font-weight: 750;
	}
	.control-section {
		display: grid;
		grid-template-columns: 0.73fr 1.27fr;
		gap: clamp(45px, 7vw, 110px);
		padding: 120px clamp(22px, 7vw, 110px);
		color: white;
		background:
			radial-gradient(circle at 10% 110%, rgba(20, 114, 99, 0.76), transparent 35%), #062f35;
	}
	.control-copy {
		align-self: center;
		max-width: 560px;
	}
	.control-copy h2 {
		margin-top: 18px;
	}
	.control-copy h2 em {
		color: #c9f528;
	}
	.control-copy > p:not(.eyebrow) {
		margin-top: 26px;
		color: #b7ceca;
		line-height: 1.75;
	}
	.authority-note {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-top: 30px;
		border-left: 3px solid var(--lime);
		padding: 12px 14px;
		color: #e7f3ef;
		background: rgba(255, 255, 255, 0.06);
		font-size: 0.72rem;
		font-weight: 750;
	}
	.authority-stage {
		position: relative;
		min-height: 610px;
		overflow: hidden;
		border: 1px solid #4e7772;
		border-radius: 15px;
		background: url('/landing/workflow-approvals.webp') center / cover;
		box-shadow: 0 32px 70px rgba(0, 0, 0, 0.22);
	}
	.authority-shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(3, 37, 41, 0.95), rgba(3, 37, 41, 0.35));
	}
	.authority-flow {
		position: relative;
		display: grid;
		width: min(440px, calc(100% - 40px));
		min-height: 610px;
		align-content: center;
		gap: 8px;
		padding: 28px;
	}
	.authority-flow article {
		border: 1px solid rgba(181, 220, 207, 0.28);
		border-radius: 8px;
		padding: 17px 18px;
		background: rgba(5, 50, 53, 0.84);
		backdrop-filter: blur(12px);
	}
	.authority-flow article.accent {
		border-color: #c9f528;
		background: rgba(14, 94, 82, 0.92);
	}
	.authority-flow small,
	.authority-flow strong,
	.authority-flow span {
		display: block;
	}
	.authority-flow small {
		color: #9dc2bb;
		font-size: 0.54rem;
		font-weight: 850;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.authority-flow strong {
		margin-top: 6px;
		font-family: Georgia, Cambria, serif;
		font-size: 1.05rem;
		font-weight: 500;
	}
	.authority-flow span {
		margin-top: 4px;
		color: #c0d3cf;
		font-size: 0.67rem;
	}
	.platform-section {
		display: grid;
		grid-template-columns: 0.72fr 1.28fr;
		gap: clamp(50px, 8vw, 130px);
		background: #eef1df;
	}
	.platform-heading h2 {
		max-width: 600px;
		margin-top: 18px;
	}
	.platform-heading h2 em {
		color: #de5d54;
	}
	.platform-heading > p:last-child {
		max-width: 510px;
		margin-top: 24px;
		color: #5d7470;
		line-height: 1.7;
	}
	.platform-points {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		align-content: end;
		gap: 16px;
	}
	.platform-points article {
		position: relative;
		min-height: 280px;
		border: 1px solid rgba(6, 47, 53, 0.16);
		border-radius: 9px;
		padding: 23px;
		background: rgba(255, 253, 248, 0.7);
	}
	.platform-points article > span {
		position: absolute;
		top: 18px;
		right: 18px;
		color: #86a09a;
		font-size: 0.61rem;
		font-weight: 850;
	}
	.platform-points :global(svg) {
		color: #247467;
	}
	.platform-points h3 {
		margin-top: 84px;
		font-family: Georgia, Cambria, serif;
		font-size: 1.25rem;
		font-weight: 500;
	}
	.platform-points p {
		margin-top: 10px;
		color: #667975;
		font-size: 0.75rem;
		line-height: 1.6;
	}
	.closing {
		position: relative;
		display: grid;
		min-height: 590px;
		place-items: center;
		overflow: hidden;
		padding: 100px 22px;
		color: white;
		text-align: center;
		background:
			linear-gradient(rgba(6, 47, 53, 0.88), rgba(6, 47, 53, 0.94)),
			url('/landing/hero-city.webp') center 57% / cover;
	}
	.closing > div:not(.closing-orbit) {
		position: relative;
		z-index: 2;
	}
	.closing h2 {
		max-width: 850px;
		margin: 18px auto 35px;
	}
	.closing h2 em {
		color: var(--lime);
	}
	.closing a {
		width: fit-content;
		height: 50px;
		margin: 0 auto;
		border: 1px solid rgba(255, 255, 255, 0.75);
		border-radius: 7px;
		padding: 0 21px;
		color: var(--ink);
		background: white;
		font-size: 0.78rem;
		font-weight: 850;
	}
	.closing-flora {
		position: absolute;
		right: -120px;
		bottom: -380px;
		width: min(46vw, 610px);
		height: auto;
		filter: saturate(1.08);
	}
	.closing-orbit {
		position: absolute;
		width: 530px;
		height: 530px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 50%;
		box-shadow:
			0 0 0 70px rgba(255, 255, 255, 0.035),
			0 0 0 140px rgba(255, 255, 255, 0.025);
	}
	.site-footer {
		display: flex;
		min-height: 118px;
		align-items: center;
		gap: 28px;
		border-top: 1px solid #d9ddd5;
		padding: 28px clamp(22px, 6vw, 90px);
		color: #153f41;
		background: #fffdf8;
	}
	.site-footer p {
		color: #6b7e7a;
		font-size: 0.72rem;
	}
	.site-footer > div {
		display: flex;
		gap: 24px;
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 800;
	}
	@keyframes rise-in {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
	}
	@keyframes scene-in {
		from {
			opacity: 0;
			transform: translateY(24px) rotate(0.8deg);
		}
	}
	@keyframes settle-left {
		from {
			opacity: 0;
			transform: translate(-30px, 25px);
		}
	}
	@keyframes settle-right {
		from {
			opacity: 0;
			transform: translate(30px, 25px);
		}
	}
	@media (max-width: 1120px) {
		.hero {
			min-height: 1190px;
		}
		.hero-layout {
			grid-template-columns: 1fr;
		}
		.hero-copy {
			max-width: 760px;
			padding-bottom: 0;
		}
		.product-scene {
			width: min(850px, 92%);
			margin-left: auto;
		}
		.hero-flora-left {
			bottom: -180px;
		}
		.hero-flora-right {
			bottom: -160px;
		}
		.section-intro,
		.control-section,
		.platform-section {
			grid-template-columns: 1fr;
		}
		.control-copy {
			max-width: 760px;
		}
		.authority-stage {
			min-height: 570px;
		}
		.platform-points {
			margin-top: 20px;
		}
	}
	@media (max-width: 900px) {
		.site-nav {
			grid-template-columns: 1fr auto;
		}
		.site-nav nav {
			display: none;
		}
		.hero h1 {
			font-size: clamp(4.2rem, 11vw, 6.2rem);
		}
		.workflow-grid {
			grid-template-columns: 1fr;
		}
		.capability-rail {
			grid-template-columns: 1fr;
		}
		.capability-rail > div {
			justify-content: flex-start;
		}
		.platform-points {
			grid-template-columns: 1fr;
		}
		.platform-points article {
			min-height: 210px;
		}
		.platform-points h3 {
			margin-top: 45px;
		}
	}
	@media (max-width: 620px) {
		:global(html) {
			scroll-behavior: auto;
		}
		.site-nav {
			width: calc(100% - 20px);
			height: 62px;
			margin-top: 10px;
			padding: 0 10px 0 14px;
		}
		.landing-brand span {
			width: 29px;
			height: 29px;
		}
		.landing-brand strong {
			font-size: 0.71rem;
		}
		.sign-in {
			display: none;
		}
		.nav-cta {
			height: 38px;
			padding: 0 12px;
		}
		.hero {
			min-height: auto;
			padding: 102px 15px 72px;
		}
		.hero-world img {
			object-position: center top;
		}
		.hero-wash {
			background:
				linear-gradient(
					180deg,
					rgba(255, 248, 238, 0.88) 0%,
					rgba(255, 248, 238, 0.48) 36%,
					rgba(247, 241, 232, 0.92) 74%
				),
				linear-gradient(90deg, rgba(255, 248, 238, 0.45), transparent);
		}
		.hero-layout {
			gap: 48px;
		}
		.hero-copy {
			padding: 24px 4px 0;
		}
		.hero-kicker {
			font-size: 0.59rem;
		}
		.hero h1 {
			margin-top: 20px;
			font-size: clamp(3.25rem, 15vw, 4.3rem);
			line-height: 0.9;
		}
		.hero-detail {
			font-size: 0.91rem;
			line-height: 1.6;
		}
		.hero-actions {
			align-items: flex-start;
			flex-direction: column;
			gap: 16px;
		}
		.hero-truth {
			font-size: 0.58rem;
		}
		.paint-one {
			top: 350px;
			left: 32px;
			width: 190px;
		}
		.paint-two,
		.hero-flora-left {
			display: none;
		}
		.hero-flora-right {
			right: -112px;
			bottom: 340px;
			width: 260px;
			opacity: 0.84;
		}
		.product-scene {
			width: 100%;
			min-height: 0;
			grid-template-columns: 1fr;
			margin: 0;
			border-width: 6px;
			border-radius: 12px;
			transform: none;
		}
		.scene-sidebar {
			display: none;
		}
		.scene-main {
			padding: 0 12px 12px;
		}
		.scene-heading {
			padding: 19px 0 14px;
		}
		.scene-heading strong {
			font-size: 1.2rem;
		}
		.scene-heading > span {
			display: none;
		}
		.scene-stats {
			grid-template-columns: 1fr;
		}
		.scene-stats div {
			border-right: 0;
			border-bottom: 1px solid #dce5e1;
		}
		.scene-stats div:last-child {
			border-bottom: 0;
		}
		.foundation-strip {
			min-height: 108px;
			flex-wrap: wrap;
			gap: 13px;
			padding: 22px 18px;
		}
		.foundation-strip p {
			width: 100%;
			margin-left: 0;
			line-height: 1.5;
		}
		.workflow-section,
		.platform-section,
		.control-section {
			padding: 82px 16px;
		}
		.section-intro {
			grid-template-columns: 1fr;
			gap: 28px;
		}
		.section-intro h2,
		.control-copy h2,
		.platform-heading h2,
		.closing h2 {
			font-size: clamp(2.65rem, 13vw, 3.7rem);
		}
		.workflow-grid {
			gap: 16px;
			margin-top: 42px;
		}
		.workflow-copy {
			grid-template-columns: auto 1fr;
			padding: 17px;
		}
		.workflow-copy > a {
			display: none;
		}
		.workflow-copy h3 {
			font-size: 1.24rem;
		}
		.capability-rail {
			margin-top: 25px;
		}
		.authority-stage,
		.authority-flow {
			min-height: 540px;
		}
		.authority-flow {
			width: 100%;
			padding: 14px;
		}
		.platform-points article {
			min-height: 190px;
		}
		.closing {
			min-height: 520px;
			padding: 80px 18px;
		}
		.closing-flora {
			right: -105px;
			bottom: -200px;
			width: 310px;
			opacity: 0.65;
		}
		.site-footer {
			align-items: flex-start;
			flex-direction: column;
			gap: 17px;
			padding: 30px 20px;
		}
		.site-footer > div {
			margin-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		.hero-copy,
		.product-scene,
		.hero-flora-left,
		.hero-flora-right {
			animation: none;
		}
		.workflow-card,
		.workflow-art img {
			transition: none;
		}
	}
</style>
