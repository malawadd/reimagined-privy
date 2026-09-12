import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';

export const claimAndExecute = internalMutation({
	args: { runId: v.id('automationRuns') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run || run.status !== 'pending') return null;
		await ctx.db.patch(args.runId, {
			status: 'claimed',
			claimedAt: Date.now(),
			updatedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.privyActions.executeAutomationRun, {
			runId: args.runId
		});
		return null;
	}
});
export const createScheduledRuns = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const due = await ctx.db
			.query('automations')
			.withIndex('by_due', (q) => q.eq('status', 'active').lt('nextRunAt', Date.now()))
			.take(100);
		let created = 0;
		for (const automation of due) {
			if (!automation.nextRunAt) continue;
			const runKey = `${automation._id}:${automation.nextRunAt}`;
			const existing = await ctx.db
				.query('automationRuns')
				.withIndex('by_run_key', (q) => q.eq('runKey', runKey))
				.unique();
			if (!existing) {
				const runId = await ctx.db.insert('automationRuns', {
					organizationId: automation.organizationId,
					automationId: automation._id,
					runKey,
					scheduledFor: automation.nextRunAt,
					status: 'pending',
					providerReferenceId: runKey,
					updatedAt: Date.now()
				});
				await ctx.scheduler.runAfter(0, internal.automationExecution.claimAndExecute, { runId });
				created += 1;
			}
		}
		return created;
	}
});
