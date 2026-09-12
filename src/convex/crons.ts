import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval(
	'create due automation outbox runs',
	{ minutes: 1 },
	internal.automationExecution.createScheduledRuns
);
crons.interval(
	'reconcile pending provider work',
	{ minutes: 5 },
	internal.privyActions.reconcilePending
);
crons.interval('mark overdue invoices', { hours: 1 }, internal.invoiceState.markOverdue);
export default crons;
