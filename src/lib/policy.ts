import { BASE_SEPOLIA } from './domain';

export interface PolicyTemplateInput {
	approvedRecipients: string[];
	treasuryDestination: string;
	automationLimitUsdc?: string;
}

export function compileTreasuryPolicy(input: PolicyTemplateInput) {
	return {
		version: '1.0',
		chain_type: 'ethereum',
		name: 'Base Sepolia treasury controls',
		default_action: 'deny',
		rules: [
			{
				name: 'owner-approved-assets',
				action: 'allow',
				chain_id: BASE_SEPOLIA.chainId,
				methods: ['eth_sendTransaction'],
				assets: ['native', BASE_SEPOLIA.usdc]
			},
			{
				name: 'automation-usdc-allowlist',
				action: 'allow',
				chain_id: BASE_SEPOLIA.chainId,
				contract: BASE_SEPOLIA.usdc,
				method: 'transfer(address,uint256)',
				recipients: input.approvedRecipients,
				max_amount: input.automationLimitUsdc ?? '100'
			},
			{
				name: 'event-sweep-destination',
				action: 'allow',
				chain_id: BASE_SEPOLIA.chainId,
				contract: BASE_SEPOLIA.usdc,
				method: 'transfer(address,uint256)',
				recipients: [input.treasuryDestination]
			}
		]
	};
}
