/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounting from "../accounting.js";
import type * as approvals from "../approvals.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as automationExecution from "../automationExecution.js";
import type * as automationMaterialize from "../automationMaterialize.js";
import type * as automations from "../automations.js";
import type * as circle_gateway from "../circle/gateway.js";
import type * as compensation from "../compensation.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as developerAccounts from "../developerAccounts.js";
import type * as developerApi from "../developerApi.js";
import type * as developerApiData from "../developerApiData.js";
import type * as developerEvents from "../developerEvents.js";
import type * as developerWebhookActions from "../developerWebhookActions.js";
import type * as developerWebhookState from "../developerWebhookState.js";
import type * as developerWebhooks from "../developerWebhooks.js";
import type * as erpnext from "../erpnext.js";
import type * as erpnext_credentials from "../erpnext/credentials.js";
import type * as erpnext_gateway from "../erpnext/gateway.js";
import type * as erpnext_types from "../erpnext/types.js";
import type * as erpnextActions from "../erpnextActions.js";
import type * as erpnextData from "../erpnextData.js";
import type * as http from "../http.js";
import type * as intentAuthorization from "../intentAuthorization.js";
import type * as intentAuthorizationActions from "../intentAuthorizationActions.js";
import type * as invoiceState from "../invoiceState.js";
import type * as invoices from "../invoices.js";
import type * as ledger from "../ledger.js";
import type * as lib_accounting from "../lib/accounting.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_validators from "../lib/validators.js";
import type * as members from "../members.js";
import type * as operationState from "../operationState.js";
import type * as operations from "../operations.js";
import type * as organizations from "../organizations.js";
import type * as payables from "../payables.js";
import type * as payoutAttemptState from "../payoutAttemptState.js";
import type * as payoutExecution from "../payoutExecution.js";
import type * as payouts from "../payouts.js";
import type * as payroll from "../payroll.js";
import type * as payrollActions from "../payrollActions.js";
import type * as personalWalletActions from "../personalWalletActions.js";
import type * as policies from "../policies.js";
import type * as privy_events from "../privy/events.js";
import type * as privy_gateway from "../privy/gateway.js";
import type * as privyActions from "../privyActions.js";
import type * as privyData from "../privyData.js";
import type * as provisioning from "../provisioning.js";
import type * as provisioningActions from "../provisioningActions.js";
import type * as recipients from "../recipients.js";
import type * as reports from "../reports.js";
import type * as users from "../users.js";
import type * as walletAssignments from "../walletAssignments.js";
import type * as walletBalanceState from "../walletBalanceState.js";
import type * as wallets from "../wallets.js";
import type * as webhookProcessing from "../webhookProcessing.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  approvals: typeof approvals;
  audit: typeof audit;
  auth: typeof auth;
  automationExecution: typeof automationExecution;
  automationMaterialize: typeof automationMaterialize;
  automations: typeof automations;
  "circle/gateway": typeof circle_gateway;
  compensation: typeof compensation;
  crons: typeof crons;
  dashboard: typeof dashboard;
  developerAccounts: typeof developerAccounts;
  developerApi: typeof developerApi;
  developerApiData: typeof developerApiData;
  developerEvents: typeof developerEvents;
  developerWebhookActions: typeof developerWebhookActions;
  developerWebhookState: typeof developerWebhookState;
  developerWebhooks: typeof developerWebhooks;
  erpnext: typeof erpnext;
  "erpnext/credentials": typeof erpnext_credentials;
  "erpnext/gateway": typeof erpnext_gateway;
  "erpnext/types": typeof erpnext_types;
  erpnextActions: typeof erpnextActions;
  erpnextData: typeof erpnextData;
  http: typeof http;
  intentAuthorization: typeof intentAuthorization;
  intentAuthorizationActions: typeof intentAuthorizationActions;
  invoiceState: typeof invoiceState;
  invoices: typeof invoices;
  ledger: typeof ledger;
  "lib/accounting": typeof lib_accounting;
  "lib/audit": typeof lib_audit;
  "lib/authz": typeof lib_authz;
  "lib/ledger": typeof lib_ledger;
  "lib/validators": typeof lib_validators;
  members: typeof members;
  operationState: typeof operationState;
  operations: typeof operations;
  organizations: typeof organizations;
  payables: typeof payables;
  payoutAttemptState: typeof payoutAttemptState;
  payoutExecution: typeof payoutExecution;
  payouts: typeof payouts;
  payroll: typeof payroll;
  payrollActions: typeof payrollActions;
  personalWalletActions: typeof personalWalletActions;
  policies: typeof policies;
  "privy/events": typeof privy_events;
  "privy/gateway": typeof privy_gateway;
  privyActions: typeof privyActions;
  privyData: typeof privyData;
  provisioning: typeof provisioning;
  provisioningActions: typeof provisioningActions;
  recipients: typeof recipients;
  reports: typeof reports;
  users: typeof users;
  walletAssignments: typeof walletAssignments;
  walletBalanceState: typeof walletBalanceState;
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
