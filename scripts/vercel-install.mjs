// Vercel install step for Baraka Tutors (text-only fix for the Hatch SDK).
//
// Problem: package.json lists
//   "@hatch/space-sdk": "file:/opt/hatch/skills/spaces/ts-runtime/dist/space-sdk.tgz"
// That path exists only on the Hatch host. On Vercel the install fails
// because the tarball is not there — and the tarball is a binary file, so
// it cannot be vendored into the repo either (the GitHub snapshot push
// rejects any binary content).
//
// Fix: this script runs as the Vercel installCommand, in the ephemeral
// build container only. It deletes the "@hatch/space-sdk" dependency
// from package.json (the Vercel client never uses the SDK — vite.config.ts
// aliases "@hatch/space-sdk/client" and "@hatch/space-sdk/fields" to
// client/vercel-shim.ts, and client/build.mjs is not part of the
// Vercel build), then runs the real install. The repo itself is never
// changed: the container's package.json edit is discarded with the
// container.
//
// Usage (vercel.json):  "installCommand": "node scripts/vercel-install.mjs"
// Local equivalent:     node scripts/vercel-install.mjs   (from repo root)
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

if (pkg.dependencies && pkg.dependencies["@hatch/space-sdk"]) {
  delete pkg.dependencies["@hatch/space-sdk"];
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(
    "[vercel-install] removed @hatch/space-sdk file: dependency (ephemeral container only)",
  );
} else {
  console.log("[vercel-install] @hatch/space-sdk not present, nothing to strip");
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

try {
  run("bun install");
} catch (err) {
  // Bun is expected on Vercel (vercel.json used `bun install` before this
  // script existed). If it is genuinely absent, fall back to npm rather
  // than failing the deploy outright.
  if (err && (err.code === "ENOENT" || err.status === 127)) {
    console.log("[vercel-install] bun not found, falling back to npm install");
    run("npm install --no-audit --no-fund");
  } else {
    throw err;
  }
}
