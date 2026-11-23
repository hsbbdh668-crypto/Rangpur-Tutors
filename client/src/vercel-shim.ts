// Vercel-only stand-in for "@hatch/space-sdk/client" (+ "/fields").
//
// Under Vite the Hatch SDK is not installed (the file: dependency cannot
// resolve on Vercel — see scripts/vercel-install.mjs), so vite.config.ts
// aliases both SDK entry points to this file. The Hatch-hosted artifact
// never loads this module: it keeps using the real SDK.
//
// What App.tsx / main.tsx / api.ts import from the SDK, and what this
// provides instead:
//   spaceQueryClient  -> a plain new QueryClient
//   SafeAreaTopScrim  -> a fixed top div honouring backgroundColor
//   setFailureNoticeText -> no-op (Vercel has no Hatch failure notice UI)
//   createActionClient -> returns the REST client (client/src/api.rest.ts)
//   ApiRequest / ApiResponse -> type aliases over the REST client
//   actionFields      -> see below

import { createElement } from "react";
import { QueryClient } from "@tanstack/react-query";
import { restApi, type RestApi } from "./api.rest";

export const spaceQueryClient = new QueryClient();

export function SafeAreaTopScrim({
  backgroundColor,
  className,
  style,
}: {
  backgroundColor?: string;
  className?: string;
  style?: Record<string, string | number>;
}): ReturnType<typeof createElement> {
  return createElement("div", {
    "aria-hidden": true,
    className,
    style: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: "env(safe-area-inset-top, 0px)",
      backgroundColor: backgroundColor ?? "var(--bg)",
      pointerEvents: "none",
      zIndex: 40,
      ...style,
    },
  });
}

export function setFailureNoticeText(
  _fn: (error: unknown, message: string) => string,
): void {
  // No-op on Vercel: there is no Hatch failure-notice UI to configure.
}

/** Returns the REST client. The generic (the Hatch `Actions` type) is
 * accepted for call-site compatibility and ignored — the returned object
 * is the REST client, typed as RestApi, so ApiResponse<typeof api, …>
 * keeps working in App.tsx / lib.ts. */
export function createActionClient<T = unknown>(): RestApi {
  void (undefined as unknown as T);
  return restApi;
}

export type ApiRequest<T, K extends keyof T> = T[K] extends (
  args: infer A,
  ...rest: any[]
) => unknown
  ? A
  : never;

export type ApiResponse<T, K extends keyof T> = T[K] extends (
  ...args: any[]
) => Promise<infer R>
  ? R
  : never;

// --- actionFields ---------------------------------------------------------
//
// The Hatch build inlines per-field form attributes (name, minLength,
// maxLength, required, …) from the zod request schemas at build time.
// On Vercel there is no build-time macro, so field props resolve to
// (almost) empty objects — App.tsx only spreads them onto <input>s, and
// the REST routes still enforce every server-side limit. The one
// attribute worth keeping is `name`, which the proxy below derives from
// the accessed field path.
//
// A plain `{}` return would CRASH the app: App.tsx reads
// FIELDS.listPosts.query, FIELDS.createPost.authorName, … — accessing a
// property of `undefined` throws before the spread ever happens. So
// actionFields returns a deep proxy: any property path resolves to a
// spreadable object whose only own key is `name`.
function fieldProxy(path: string): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      if (prop === "then") return undefined; // never treat as a thenable
      if (prop === "name") return path.split(".").pop() ?? "";
      return fieldProxy(path ? `${path}.${prop}` : prop);
    },
    ownKeys() {
      return ["name"];
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (prop === "name") {
        return {
          configurable: true,
          enumerable: true,
          value: path.split(".").pop() ?? "",
        };
      }
      return undefined;
    },
  });
}

export function actionFields<T = unknown>(): Record<string, unknown> {
  void (undefined as unknown as T);
  return fieldProxy("");
}
