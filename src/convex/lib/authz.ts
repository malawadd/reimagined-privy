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
	const organization = await ctx.db.get(organizationId);
	if (!organization?.active) throw new Error('Organization is not active.');
	if (capability && !can(membership.role as OrgRole, capability))
		throw new Error('Insufficient organization role.');
	return { identity, user, membership, organization };
}

export async function requireWalletPermission(
	ctx: GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>,
	organizationId: Id<'organizations'>,
	walletId: Id<'wallets'>,
	permission: 'view' | 'initiate' | 'approve' | 'manage',
	capability?: Capability
) {
	const scope = await requireMembership(ctx, organizationId, capability);
	const wallet = await ctx.db.get(walletId);
	assertOrgScoped(wallet, organizationId);
	if (scope.membership.role === 'owner') return { ...scope, wallet };
	const assignment = await ctx.db
		.query('walletAssignments')
		.withIndex('by_wallet_user', (q) => q.eq('walletId', walletId).eq('userId', scope.user._id))
		.unique();
	if (!assignment || assignment.status !== 'active' || !assignment.permissions.includes(permission))
		throw new Error('Wallet access denied.');
	return { ...scope, wallet, assignment };
}

export async function requirePlatformOperator(ctx: Ctx) {
	const identity = await requireIdentity(ctx);
	const allowed = (process.env.RATIB_OPERATOR_PRIVY_DIDS ?? '')
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	if (!allowed.includes(identity.subject)) throw new Error('Platform operator access denied.');
	return identity;
}

export function assertOrgScoped<T extends { organizationId: Id<'organizations'> }>(
	record: T | null,
	organizationId: Id<'organizations'>
): asserts record is T {
	if (!record || record.organizationId !== organizationId) throw new Error('Resource not found.');
}
