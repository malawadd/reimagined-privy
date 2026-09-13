import { BASE_SEPOLIA, normalizeDecimal, normalizeEvmAddress } from './domain';

export interface PolicyTemplateInput {
	approvedRecipients: string[];
	treasuryDestination: string;
	automationLimitUsdc?: string;
}

export function compileTreasuryPolicy(input: PolicyTemplateInput) {
	const approvedRecipients = input.approvedRecipients.map(normalizeEvmAddress);
	const treasuryDestination = normalizeEvmAddress(input.treasuryDestination);
	const automationLimitUsdc = normalizeDecimal(input.automationLimitUsdc ?? '100', 6);
	if (approvedRecipients.length === 0)
		throw new Error('At least one approved automation recipient is required.');

	return {
		version: '1.0' as const,
		chain_type: 'ethereum' as const,
		name: 'Base Sepolia automation controls',
		rules: [
			{
				name: 'Allow bounded Base Sepolia USDC vendor transfers',
				method: 'transfer',
				conditions: [
					{
						field_source: 'action_request_body',
						field: 'source.asset',
						operator: 'eq',
						value: 'usdc'
					},
					{
						field_source: 'action_request_body',
						field: 'source.chain',
						operator: 'eq',
						value: BASE_SEPOLIA.transferChain
					},
					{
						field_source: 'action_request_body',
						field: 'source.amount',
						operator: 'lte',
						value: automationLimitUsdc
					},
					{
						field_source: 'action_request_body',
						field: 'destination.address',
						operator: 'in',
						value: approvedRecipients
					}
				],
				action: 'ALLOW' as const
			},
			{
				name: 'Allow Base Sepolia USDC sweeps to treasury',
				method: 'transfer',
				conditions: [
					{
						field_source: 'action_request_body',
						field: 'source.asset',
						operator: 'eq',
						value: 'usdc'
					},
					{
						field_source: 'action_request_body',
						field: 'source.chain',
						operator: 'eq',
						value: BASE_SEPOLIA.transferChain
					},
					{
						field_source: 'action_request_body',
						field: 'destination.address',
						operator: 'eq',
						value: treasuryDestination
					}
				],
				action: 'ALLOW' as const
			}
		]
	};
}

export function compileOwnerPolicy(name = 'Base Sepolia treasury owner controls') {
	return {
		version: '1.0' as const,
		chain_type: 'ethereum' as const,
		name,
		rules: [
			{
				name: 'Allow owner Base Sepolia ETH transfers',
				method: 'transfer',
				conditions: [
					{
						field_source: 'action_request_body',
						field: 'source.asset',
						operator: 'eq',
						value: 'eth'
					},
					{
						field_source: 'action_request_body',
						field: 'source.chain',
						operator: 'eq',
						value: BASE_SEPOLIA.transferChain
					}
				],
				action: 'ALLOW' as const
			},
			{
				name: 'Allow owner Base Sepolia USDC transfers',
				method: 'transfer',
				conditions: [
					{
						field_source: 'action_request_body',
						field: 'source.asset',
						operator: 'eq',
						value: 'usdc'
					},
					{
						field_source: 'action_request_body',
						field: 'source.chain',
						operator: 'eq',
						value: BASE_SEPOLIA.transferChain
					}
				],
				action: 'ALLOW' as const
			}
		]
	};
}

export function compileSweepPolicy(treasuryDestination: string) {
	return {
		version: '1.0' as const,
		chain_type: 'ethereum' as const,
		name: 'Base Sepolia invoice collection sweep',
		rules: [
			{
				name: 'Allow USDC collection sweeps to treasury',
				method: 'transfer',
				conditions: [
					{
						field_source: 'action_request_body',
						field: 'source.asset',
						operator: 'eq',
						value: 'usdc'
					},
					{
						field_source: 'action_request_body',
						field: 'source.chain',
						operator: 'eq',
						value: BASE_SEPOLIA.transferChain
					},
					{
						field_source: 'action_request_body',
						field: 'destination.address',
						operator: 'eq',
						value: normalizeEvmAddress(treasuryDestination)
					}
				],
				action: 'ALLOW' as const
			}
		]
	};
}
