import { browser } from '$app/environment';
import type { Id } from '../convex/_generated/dataModel';

const STORAGE_KEY = 'ratib:active-organization';

class WorkspaceStore {
	activeOrganizationId = $state<Id<'organizations'> | null>(null);

	reconcile(organizationIds: Id<'organizations'>[]) {
		if (organizationIds.length === 0) {
			this.activeOrganizationId = null;
			return;
		}

		const stored = browser ? localStorage.getItem(STORAGE_KEY) : null;
		const preferred = this.activeOrganizationId ?? (stored as Id<'organizations'> | null);
		this.select(preferred && organizationIds.includes(preferred) ? preferred : organizationIds[0]);
	}

	select(organizationId: Id<'organizations'>) {
		this.activeOrganizationId = organizationId;
		if (browser) localStorage.setItem(STORAGE_KEY, organizationId);
	}
}

export const workspace = new WorkspaceStore();
