/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as enrich from "../enrich.js";
import type * as flags from "../flags.js";
import type * as flagsInternal from "../flagsInternal.js";
import type * as lib_match from "../lib/match.js";
import type * as lib_parseRecalls from "../lib/parseRecalls.js";
import type * as match from "../match.js";
import type * as notify from "../notify.js";
import type * as products from "../products.js";
import type * as recalls from "../recalls.js";
import type * as recallsActions from "../recallsActions.js";
import type * as summarize from "../summarize.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  enrich: typeof enrich;
  flags: typeof flags;
  flagsInternal: typeof flagsInternal;
  "lib/match": typeof lib_match;
  "lib/parseRecalls": typeof lib_parseRecalls;
  match: typeof match;
  notify: typeof notify;
  products: typeof products;
  recalls: typeof recalls;
  recallsActions: typeof recallsActions;
  summarize: typeof summarize;
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
