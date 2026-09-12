import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const createOperation = internalMutation({
	args: { runId: v.id('automationRuns') },
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) throw new Error('Run missing.');
		if (run.operationId) return run.operationId;
		const automation = await ctx.db.get(run.automationId);
		if (!automation) throw new Error('Automation missing.');
		const amount = run.amount ?? automation.amount;
		if (!amount) throw new Error('Automation amount missing.');
		const now = Date.now();
		const operationId = await ctx.db.insert('operations', {
			organizationId: run.organizationId,
			kind: 'automationRun',
			status: 'executing',
			approvalPath: 'automationSigner',
			asset: 'USDC',
			amount,
			destination: automation.destination,
			reference: automation.name,
			automationRunId: run._id,
			correlationId: run.runKey,
			createdAt: now,
			updatedAt: now
		});
		await ctx.db.patch(args.runId, { operationId, updatedAt: now });
		return operationId;
	}
});
