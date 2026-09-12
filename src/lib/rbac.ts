import type { OrgRole } from './domain';

export type Capability =
	| 'org:manage'
	| 'team:manage'
	| 'wallet:read'
	| 'wallet:manage'
	| 'policy:manage'
	| 'payment:create'
	| 'approval:read'
	| 'automation:manage'
	| 'audit:read';

const permissions: Record<OrgRole, readonly Capability[]> = {
	owner: [
		'org:manage',
		'team:manage',
		'wallet:read',
		'wallet:manage',
		'policy:manage',
		'payment:create',
		'approval:read',
		'automation:manage',
		'audit:read'
	],
	admin: [
		'team:manage',
		'wallet:read',
		'wallet:manage',
		'policy:manage',
		'payment:create',
		'approval:read',
		'automation:manage',
		'audit:read'
	],
	operator: ['wallet:read', 'payment:create', 'approval:read', 'automation:manage', 'audit:read'],
	approver: ['wallet:read', 'approval:read', 'audit:read'],
	auditor: ['wallet:read', 'approval:read', 'audit:read']
};

export function can(role: OrgRole, capability: Capability): boolean {
	return permissions[role].includes(capability);
}

export function assertCan(role: OrgRole, capability: Capability): void {
	if (!can(role, capability)) throw new Error(`Role ${role} cannot perform ${capability}.`);
}
