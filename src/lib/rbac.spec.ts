import { describe, expect, it } from 'vitest';
import { can } from './rbac';

describe('RBAC matrix', () => {
	it('reserves organization lifecycle for owners', () => {
		expect(can('owner', 'org:manage')).toBe(true);
		expect(can('admin', 'org:manage')).toBe(false);
	});
	it('prevents operators from changing policy or team', () => {
		expect(can('operator', 'payment:create')).toBe(true);
		expect(can('operator', 'policy:manage')).toBe(false);
		expect(can('operator', 'team:manage')).toBe(false);
	});
	it('keeps auditors read only', () => {
		expect(can('auditor', 'audit:read')).toBe(true);
		expect(can('auditor', 'payment:create')).toBe(false);
	});
});
