// Development fallback. `pnpm convex dev` replaces this with generated, data-model-aware bindings.
export {
	queryGeneric as query,
	mutationGeneric as mutation,
	actionGeneric as action,
	internalQueryGeneric as internalQuery,
	internalMutationGeneric as internalMutation,
	internalActionGeneric as internalAction,
	httpActionGeneric as httpAction
} from 'convex/server';
