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
crons.interval(
	'prune developer API replay records',
	{ hours: 1 },
	internal.developerApiData.pruneExpiredSecurityRecords
);
crons.interval(
	'recover expired developer webhook claims',
	{ minutes: 1 },
	internal.developerWebhookState.recoverStaleClaims
);
crons.interval('dispatch scheduled payout runs', { minutes: 1 }, internal.payouts.dispatchDue);
crons.interval(
	'sync due ERPNext connections',
	{ minutes: 5 },
	internal.erpnextActions.syncDueConnections
);
export default crons;
