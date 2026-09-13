import type { OrgRole } from './domain';

export type Capability =
	| 'org:manage'
	| 'team:read'
	| 'team:manage'
	| 'wallet:read'
	| 'wallet:manage'
	| 'policy:manage'
	| 'payment:create'
	| 'approval:read'
	| 'invoice:read'
	| 'invoice:manage'
	| 'payable:read'
	| 'payable:manage'
	| 'batch:manage'
	| 'payroll:read'
	| 'payroll:manage'
	| 'payout:read'
	| 'payout:manage'
	| 'ledger:read'
	| 'reconciliation:manage'
	| 'accounting:prepare'
	| 'accounting:review'
	| 'accounting:close'
	| 'integration:manage'
	| 'developer:manage'
	| 'automation:manage'
	| 'audit:read';

const permissions: Record<OrgRole, readonly Capability[]> = {
	owner: [
		'org:manage',
		'team:read',
		'team:manage',
		'wallet:read',
		'wallet:manage',
		'policy:manage',
		'payment:create',
		'approval:read',
		'invoice:read',
		'invoice:manage',
		'payable:read',
		'payable:manage',
		'batch:manage',
		'payroll:read',
		'payroll:manage',
		'payout:read',
		'payout:manage',
		'ledger:read',
		'reconciliation:manage',
		'accounting:prepare',
		'accounting:review',
		'accounting:close',
		'integration:manage',
		'developer:manage',
		'automation:manage',
		'audit:read'
	],
	admin: [
		'team:read',
		'team:manage',
		'wallet:read',
		'wallet:manage',
		'policy:manage',
		'payment:create',
		'approval:read',
		'invoice:read',
		'invoice:manage',
		'payable:read',
		'payable:manage',
		'batch:manage',
		'payroll:read',
		'payroll:manage',
		'payout:read',
		'payout:manage',
		'ledger:read',
		'reconciliation:manage',
		'accounting:prepare',
		'accounting:review',
		'accounting:close',
		'integration:manage',
		'developer:manage',
		'automation:manage',
		'audit:read'
	],
	operator: [
		'team:read',
		'wallet:read',
		'payment:create',
		'approval:read',
		'invoice:read',
		'invoice:manage',
		'payable:read',
		'payable:manage',
		'batch:manage',
		'payroll:read',
		'payroll:manage',
		'payout:read',
		'payout:manage',
		'ledger:read',
		'reconciliation:manage',
		'accounting:prepare',
		'automation:manage',
		'audit:read'
	],
	approver: [
		'team:read',
		'wallet:read',
		'approval:read',
		'invoice:read',
		'payable:read',
		'payroll:read',
		'payout:read',
		'ledger:read',
		'accounting:review',
		'accounting:close',
		'audit:read'
	],
	auditor: [
		'team:read',
		'wallet:read',
		'approval:read',
		'invoice:read',
		'payable:read',
		'payroll:read',
		'payout:read',
		'ledger:read',
		'audit:read'
	]
};

export function can(role: OrgRole, capability: Capability): boolean {
	return permissions[role].includes(capability);
}

export function assertCan(role: OrgRole, capability: Capability): void {
	if (!can(role, capability)) throw new Error(`Role ${role} cannot perform ${capability}.`);
}
