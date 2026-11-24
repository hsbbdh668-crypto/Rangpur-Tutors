// Host-only privileged handlers for Baraka Tutors.
//
// The portable action bundle (src/actions.ts) must not read the `process`
// global or import Node/Bun host modules, so environment access and
// password cryptography live here instead. Actions declare the contracts
// and call them through `ctx.executePrivileged(...)`.
//
// adminPasscodeFromEnv — returns the ADMIN_PASSCODE environment variable
// (set in Vercel → Settings → Environment Variables, or a local `.env`).
// This is how the admin passcode stays OUT of the code in production.
//
// hashPassword / verifyPassword / randomToken — tutor-account crypto.
// The scrypt parameters are EXACTLY the ones the action bundle used
// before this move (64-byte key, 16-byte random salt, hex-encoded), so
// password hashes already stored in the tutors table keep verifying.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
  hashPassword: {
    request: z.object({ password: z.string().min(1).max(200) }),
    response: z.object({ hash: z.string(), salt: z.string() }),
  },
  verifyPassword: {
    request: z.object({
      password: z.string().min(1).max(200),
      hash: z.string().max(500),
      salt: z.string().max(200),
    }),
    response: z.object({ ok: z.boolean() }),
  },
  randomToken: {
    request: z.object({ bytes: z.number().int().min(8).max(64) }),
    response: z.object({ token: z.string() }),
  },
});

export const PrivilegedHandlers = definePrivilegedHandlers(Privileged, {
  adminPasscodeFromEnv: () => ({
    passcode: (process.env.ADMIN_PASSCODE ?? process.env.ADMIN_PASSWORD ?? "").trim(),
  }),
  hashPassword: ({ password }) => {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return { hash, salt };
  },
  verifyPassword: ({ password, hash, salt }) => {
    try {
      const expected = Buffer.from(hash, "hex");
      const actual = scryptSync(password, salt, 64);
      return { ok: expected.length === actual.length && timingSafeEqual(expected, actual) };
    } catch {
      return { ok: false };
    }
  },
  randomToken: ({ bytes }) => ({ token: randomBytes(bytes).toString("hex") }),
});
