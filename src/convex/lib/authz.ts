import type { GenericMutationCtx, GenericQueryCtx, GenericActionCtx } from 'convex/server';
import type { DataModel, Id } from '../_generated/dataModel';
import type { OrgRole } from '../../lib/domain';
import { can, type Capability } from '../../lib/rbac';

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel> | GenericActionCtx<DataModel>;

export async function requireIdentity(ctx: Ctx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Unauthenticated');
	return identity;
}

export async function requireMembership(
	ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
	organizationId: Id<'organizations'>,
	capability?: Capability
) {
	const identity = await requireIdentity(ctx);
	const user = await ctx.db
		.query('users')
		.withIndex('by_privy_did', (q) => q.eq('privyDid', identity.subject))
		.unique();
	if (!user) throw new Error('User has not been synchronized.');
	const membership = await ctx.db
		.query('memberships')
		.withIndex('by_org_user', (q) => q.eq('organizationId', organizationId).eq('userId', user._id))
		.unique();
	if (!membership || membership.status !== 'active') throw new Error('Organization access denied.');
	if (capability && !can(membership.role as OrgRole, capability))
		throw new Error('Insufficient organization role.');
	return { identity, user, membership };
}

export function assertOrgScoped<T extends { organizationId: Id<'organizations'> }>(
	record: T | null,
	organizationId: Id<'organizations'>
): asserts record is T {
	if (!record || record.organizationId !== organizationId) throw new Error('Resource not found.');
}
