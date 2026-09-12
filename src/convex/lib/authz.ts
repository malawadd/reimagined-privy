import type {
	GenericMutationCtx,
	GenericQueryCtx,
	GenericActionCtx,
	GenericDataModel
} from 'convex/server';
import type { OrgRole } from '../../lib/domain';
import { can, type Capability } from '../../lib/rbac';

type Ctx =
	| GenericQueryCtx<GenericDataModel>
	| GenericMutationCtx<GenericDataModel>
	| GenericActionCtx<GenericDataModel>;

export async function requireIdentity(ctx: Ctx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error('Unauthenticated');
	return identity;
}

export async function requireMembership(
	ctx: GenericQueryCtx<GenericDataModel> | GenericMutationCtx<GenericDataModel>,
	organizationId: string,
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
		.filter((q) =>
			q.and(q.eq(q.field('organizationId'), organizationId), q.eq(q.field('userId'), user._id))
		)
		.unique();
	if (!membership || membership.status !== 'active') throw new Error('Organization access denied.');
	if (capability && !can(membership.role as OrgRole, capability))
		throw new Error('Insufficient organization role.');
	return { identity, user, membership };
}

export function assertOrgScoped<T extends { organizationId: string }>(
	record: T | null,
	organizationId: string
): asserts record is T {
	if (!record || record.organizationId !== organizationId) throw new Error('Resource not found.');
}
