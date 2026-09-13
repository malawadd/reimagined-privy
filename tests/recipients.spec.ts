import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '../src/convex/schema';
import { api } from '../src/convex/_generated/api';

const modules = import.meta.glob('../src/convex/**/*.ts');
const address = '0x0000000000000000000000000000000000000001';

async function setup() {
	const t = convexTest(schema, modules);
	const owner = t.withIdentity({
		subject: 'did:privy:recipient-owner',
		email: 'owner@example.com'
	});
	const admin = t.withIdentity({
		subject: 'did:privy:recipient-admin',
		email: 'admin@example.com'
	});
	const ownerId = await owner.mutation(api.users.syncCurrent, {});
	const adminId = await admin.mutation(api.users.syncCurrent, {});
	const organizationId = await t.run(async (ctx) => {
		const id = await ctx.db.insert('organizations', {
			name: 'Recipient Test',
			slug: `recipient-${crypto.randomUUID()}`,
			createdByUserId: ownerId,
			active: true
		});
		await ctx.db.insert('memberships', {
			organizationId: id,
			userId: ownerId,
			role: 'owner',
			status: 'active'
		});
		await ctx.db.insert('memberships', {
			organizationId: id,
			userId: adminId,
			role: 'admin',
			status: 'active'
		});
		return id;
	});
	return { t, owner, admin, organizationId };
}

describe('counterparty maker-checker', () => {
	it('requires a different authorized member to approve a destination', async () => {
		const { owner, admin, organizationId } = await setup();
		const recipientId = await owner.mutation(api.recipients.create, {
			organizationId,
			label: 'Vendor',
			address,
			assets: ['USDC']
		});
		await expect(
			owner.mutation(api.recipients.approve, { organizationId, recipientId })
		).rejects.toThrow('different authorized member');
		await admin.mutation(api.recipients.approve, { organizationId, recipientId });
		const rows = await owner.query(api.recipients.list, { organizationId });
		expect(rows[0]).toMatchObject({ status: 'approved', approvedAt: expect.any(Number) });
	});
});
