// Host-only privileged handlers for Baraka Tutors.
//
// The portable action bundle (src/actions.ts) must not read the `process`
// global, so reading environment variables lives here instead. Actions
// declare the contract and call it through `ctx.executePrivileged(...)`.
//
// adminPasscodeFromEnv — returns the ADMIN_PASSCODE environment variable
// (set in Vercel → Settings → Environment Variables, or a local `.env`).
// This is how the admin passcode stays OUT of the code in production.

import {
  definePrivilegedContracts,
  definePrivilegedHandlers,
  z,
} from "@hatch/space-sdk";

export const Privileged = definePrivilegedContracts({
  adminPasscodeFromEnv: {
    request: z.object({}),
    response: z.object({ passcode: z.string() }),
  },
});

export const PrivilegedHandlers = definePrivilegedHandlers(Privileged, {
  adminPasscodeFromEnv: () => ({
    passcode: (process.env.ADMIN_PASSCODE ?? process.env.ADMIN_PASSWORD ?? "").trim(),
  }),
});
