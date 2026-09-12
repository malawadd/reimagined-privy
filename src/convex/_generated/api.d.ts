/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as automationExecution from "../automationExecution.js";
import type * as automationMaterialize from "../automationMaterialize.js";
import type * as automations from "../automations.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authz from "../lib/authz.js";
import type * as members from "../members.js";
import type * as operationState from "../operationState.js";
import type * as operations from "../operations.js";
import type * as organizations from "../organizations.js";
import type * as policies from "../policies.js";
import type * as privy_events from "../privy/events.js";
import type * as privy_gateway from "../privy/gateway.js";
import type * as privyActions from "../privyActions.js";
import type * as privyData from "../privyData.js";
import type * as users from "../users.js";
import type * as wallets from "../wallets.js";
import type * as webhookProcessing from "../webhookProcessing.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  automationExecution: typeof automationExecution;
  automationMaterialize: typeof automationMaterialize;
  automations: typeof automations;
  crons: typeof crons;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/authz": typeof lib_authz;
  members: typeof members;
  operationState: typeof operationState;
  operations: typeof operations;
  organizations: typeof organizations;
  policies: typeof policies;
  "privy/events": typeof privy_events;
  "privy/gateway": typeof privy_gateway;
  privyActions: typeof privyActions;
  privyData: typeof privyData;
  users: typeof users;
  wallets: typeof wallets;
  webhookProcessing: typeof webhookProcessing;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
