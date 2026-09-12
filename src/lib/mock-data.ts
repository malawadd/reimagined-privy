import { BASE_SEPOLIA, type OperationStatus } from './domain';

export const organization = {
	name: 'Northstar Labs',
	role: 'owner' as const,
	reviewerThreshold: 2,
	reviewerCount: 3,
	wallet: {
		name: 'Operating Treasury',
		id: 'wallet_01JPRIVYB2BTREASURY',
		address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
		eth: '2.4187',
		usdc: '48,250.00',
		policy: 'Base Sepolia treasury controls'
	}
};

export const operations: Array<{
	id: string;
	title: string;
	kind: string;
	amount: string;
	status: OperationStatus;
	time: string;
	path: string;
}> = [
	{
		id: 'op_84db21',
		title: 'Cloud hosting · September',
		kind: 'Vendor payout',
		amount: '84.00 USDC',
		status: 'succeeded',
		time: '11:42',
		path: 'Automation signer'
	},
	{
		id: 'op_7cb914',
		title: 'Studio milestone',
		kind: 'Vendor payout',
		amount: '4,800.00 USDC',
		status: 'pendingApproval',
		time: '10:18',
		path: '2-of-3 intent'
	},
	{
		id: 'op_1bd255',
		title: 'Collection sweep',
		kind: 'Treasury transfer',
		amount: '1,250.00 USDC',
		status: 'pendingConfirmation',
		time: '09:31',
		path: 'Event policy'
	},
	{
		id: 'op_311a80',
		title: 'Travel reimbursements',
		kind: 'Batch payout',
		amount: '320.00 USDC',
		status: 'rejected',
		time: 'Yesterday',
		path: '2-of-3 intent'
	}
];

export const approvals = [
	{
		id: 'intent_01JQ6NWK19F0',
		title: 'Studio milestone',
		amount: '4,800.00 USDC',
		progress: 1,
		required: 2,
		expires: 'Sep 13, 10:18',
		createdBy: 'Mina — Operator'
	},
	{
		id: 'intent_01JQ6MPE9B31',
		title: 'Rotate automation signer',
		amount: 'Wallet update',
		progress: 0,
		required: 2,
		expires: 'Sep 14, 08:40',
		createdBy: 'Avery — Owner'
	}
];

export const automations = [
	{
		id: 'auto_vendor_cloud',
		name: 'Cloud hosting',
		trigger: 'Monthly · day 12, 09:00 UTC',
		boundary: '≤ 100 USDC · allowlisted',
		status: 'active',
		runs: 12
	},
	{
		id: 'auto_sweep_primary',
		name: 'Collection sweep',
		trigger: 'USDC deposit received',
		boundary: `Only to ${organization.wallet.address.slice(0, 8)}…`,
		status: 'active',
		runs: 38
	},
	{
		id: 'auto_software',
		name: 'Design software',
		trigger: 'Monthly · day 01, 09:00 UTC',
		boundary: '≤ 75 USDC · allowlisted',
		status: 'paused',
		runs: 6
	}
];

export const team = [
	{ name: 'Avery Stone', email: 'avery@northstar.test', role: 'owner', reviewer: 'Reviewer · MFA' },
	{
		name: 'Noor Al-Salem',
		email: 'noor@northstar.test',
		role: 'admin',
		reviewer: 'Reviewer · MFA'
	},
	{ name: 'Jon Bell', email: 'jon@northstar.test', role: 'approver', reviewer: 'Reviewer · MFA' },
	{
		name: 'Mina Ortiz',
		email: 'mina@northstar.test',
		role: 'operator',
		reviewer: 'No Privy authority'
	},
	{
		name: 'Priya Shah',
		email: 'priya@northstar.test',
		role: 'auditor',
		reviewer: 'No Privy authority'
	}
];

export const auditEvents = [
	{
		time: 'Sep 12 · 11:42:18',
		actor: 'svc/vendor-payments',
		action: 'operation.succeeded',
		resource: 'op_84db21',
		correlation: 'auto_vendor_cloud:1789203600000'
	},
	{
		time: 'Sep 12 · 11:42:07',
		actor: 'Privy webhook',
		action: 'wallet_action.confirmed',
		resource: 'wa_01JQ6P...',
		correlation: 'op_84db21'
	},
	{
		time: 'Sep 12 · 10:18:49',
		actor: 'Mina Ortiz',
		action: 'payment.intent_created',
		resource: 'intent_01JQ6NWK19F0',
		correlation: 'op_7cb914'
	},
	{
		time: 'Sep 12 · 09:31:20',
		actor: 'Privy webhook',
		action: 'deposit.detected',
		resource: 'evt_01JQ6K...',
		correlation: 'auto_sweep_primary:evt_01JQ6K'
	},
	{
		time: 'Sep 11 · 16:06:02',
		actor: 'Noor Al-Salem',
		action: 'policy.update_requested',
		resource: 'policy_01JQ5...',
		correlation: 'op_298b45'
	}
];

export const setupSteps = [
	{ name: 'Privy server credentials', detail: 'App ID and secret stored in Convex', done: true },
	{ name: 'Reviewer quorum', detail: '2-of-3 Dashboard reviewers with MFA', done: true },
	{
		name: 'Automation authorization key',
		detail: 'Signer attached with override policies',
		done: true
	},
	{
		name: 'Signed webhook endpoint',
		detail: 'Svix verification and event subscriptions',
		done: true
	},
	{ name: 'Gas sponsorship', detail: 'Configure Base Sepolia sponsorship', done: false },
	{
		name: 'Treasury funding',
		detail: `Fund ETH and USDC on chain ${BASE_SEPOLIA.chainId}`,
		done: true
	}
];
