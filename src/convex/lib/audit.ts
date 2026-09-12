import type { GenericMutationCtx, GenericDataModel } from 'convex/server';
import { redactAuditMetadata } from '../../lib/audit';

export async function appendAudit(
	ctx: GenericMutationCtx<GenericDataModel>,
	event: {
		organizationId: string;
		actorType: 'user' | 'servicePrincipal' | 'privy' | 'system';
		actorId: string;
		action: string;
		resourceType: string;
		resourceId: string;
		correlationId: string;
		privyIds?: string[];
		transactionHash?: string;
		metadata?: unknown;
	}
) {
	return ctx.db.insert('auditEvents', {
		...event,
		privyIds: event.privyIds ?? [],
		metadata: redactAuditMetadata(event.metadata ?? {}) as never,
		occurredAt: Date.now()
	});
}
