import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertOrgScoped, requireMembership } from './lib/authz';
import { normalizeDecimal } from '../lib/domain';
import { appendAudit } from './lib/audit';

const frequency = v.union(
	v.literal('weekly'),
	v.literal('biweekly'),
	v.literal('semimonthly'),
	v.literal('monthly'),
	v.literal('adhoc')
);

export const list = query({
	args: { organizationId: v.id('organizations') },
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		await requireMembership(ctx, args.organizationId, 'payroll:read');
		const profiles = await ctx.db
			.query('compensationProfiles')
			.withIndex('by_org_status', (q) =>
				q.eq('organizationId', args.organizationId).eq('status', 'active')
			)
			.take(250);
		return Promise.all(
			profiles.map(async (profile) => ({ profile, user: await ctx.db.get(profile.userId) }))
		);
	}
});

export const set = mutation({
	args: {
		organizationId: v.id('organizations'),
		userId: v.id('users'),
		employeeCode: v.optional(v.string()),
		department: v.optional(v.string()),
		baseAmount: v.string(),
		denominationCurrency: v.string(),
		payFrequency: frequency,
		effectiveFrom: v.string()
	},
	returns: v.id('compensationProfiles'),
	handler: async (ctx, args) => {
		const { user } = await requireMembership(ctx, args.organizationId, 'payroll:manage');
		const member = await ctx.db
			.query('memberships')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', args.userId)
			)
			.unique();
		if (!member || member.status !== 'active')
			throw new Error('Compensation member is not active.');
		const memberUser = await ctx.db.get(args.userId);
		if (!memberUser) throw new Error('Compensation member was not found.');
		const baseAmount = normalizeDecimal(args.baseAmount, 6);
		if (baseAmount === '0') throw new Error('Base compensation must be greater than zero.');
		const currency = args.denominationCurrency.trim().toUpperCase();
		if (currency !== 'USD')
			throw new Error('Base Sepolia payroll currently supports USD-denominated compensation.');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(args.effectiveFrom))
			throw new Error('Effective date must use YYYY-MM-DD.');
		const employeeCode = optionalText(args.employeeCode, 40, 'Employee code');
		const department = optionalText(args.department, 80, 'Department');
		const active = await ctx.db
			.query('compensationProfiles')
			.withIndex('by_org_user', (q) =>
				q.eq('organizationId', args.organizationId).eq('userId', args.userId)
			)
			.filter((q) => q.eq(q.field('status'), 'active'))
			.unique();
		if (active) {
			assertOrgScoped(active, args.organizationId);
			await ctx.db.patch(active._id, {
				status: 'superseded',
				effectiveTo: args.effectiveFrom,
				updatedAt: Date.now()
			});
		}
		const now = Date.now();
		const profileId = await ctx.db.insert('compensationProfiles', {
			organizationId: args.organizationId,
			userId: args.userId,
			employeeCode,
			department,
			baseAmount,
			denominationCurrency: currency,
			payFrequency: args.payFrequency,
			status: 'active',
			version: (active?.version ?? 0) + 1,
			effectiveFrom: args.effectiveFrom,
			createdBy: user._id,
			createdAt: now,
			updatedAt: now
		});
		await appendAudit(ctx, {
			organizationId: args.organizationId,
			actorType: 'user',
			actorId: user.privyDid,
			action: 'payroll.compensation_version_created',
			resourceType: 'compensationProfile',
			resourceId: profileId,
			correlationId: `compensation:${args.organizationId}:${args.userId}`,
			metadata: { version: (active?.version ?? 0) + 1, denominationCurrency: currency }
		});
		return profileId;
	}
});

function optionalText(value: string | undefined, max: number, label: string) {
	const normalized = value?.trim();
	if (normalized && normalized.length > max)
		throw new Error(`${label} must not exceed ${max} characters.`);
	return normalized || undefined;
}
