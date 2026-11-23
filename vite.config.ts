// Vite-only build config for the Vercel deployment of Baraka Tutors.
//
// The Hatch-hosted artifact does NOT use this file: it builds with
// client/build.mjs (Bun + @hatch/space-sdk/build). This config exists so
// `bun run build:vercel` (package.json) produces a plain static client
// in client/dist that talks to the REST routes under /api/*.
//
// What it does:
//  - root "client", so client/index.html is the entry and the output is
//    client/dist (matches vercel.json outputDirectory).
//  - React + Tailwind v4 (@tailwindcss/vite; tailwindcss 4.1.13 is already
//    a devDependency).
//  - Aliases both Hatch SDK entry points to client/src/vercel-shim.ts, so
//    the existing client files (api.ts, App.tsx, main.tsx) build unchanged:
//    the shim's createActionClient returns the REST client, and its
//    spaceQueryClient / SafeAreaTopScrim / setFailureNoticeText stand in
//    for the SDK's.
//  - Aliases the binary logo import to the text-only base64 module
//    (client/src/assets/baraka-logo.data.ts), so the repo stays 100%
//    text files for the GitHub push — the .webp itself is never needed
//    by this build.
//  - Rewrites the Bun-only macro import in App.tsx
//    (`import { actionFields } from "@hatch/space-sdk/fields" with
//    { type: "macro" };`) to a plain import of the shim. Vite/esbuild
//    cannot parse the `with { type: "macro" }` import attribute, so the
//    rewrite runs as a pre-transform, before anything parses the file.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(repoRoot, "client");
const shimPath = resolve(clientDir, "src/vercel-shim.ts");
const logoDataPath = resolve(clientDir, "src/assets/baraka-logo.data.ts");

function hatchMacroRewrite() {
  return {
    name: "baraka-hatch-macro-rewrite",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith("client/src/App.tsx")) return null;
      if (!code.includes("@hatch/space-sdk/fields")) return null;
      const rewritten = code.replace(
        /import\s*\{\s*actionFields\s*\}\s*from\s*"@hatch\/space-sdk\/fields"\s*with\s*\{\s*type:\s*"macro"\s*\}\s*;/,
        'import { actionFields } from "./vercel-shim";',
      );
      return rewritten === code ? null : rewritten;
    },
  };
}

export default defineConfig({
  root: clientDir,
  plugins: [hatchMacroRewrite(), react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@hatch/space-sdk/client", replacement: shimPath },
      { find: "@hatch/space-sdk/fields", replacement: shimPath },
      // App.tsx: import barakaLogo from "./assets/baraka-logo.webp"
      // NOTE: Vite aliases do a substring replace of `find` in the import
      // specifier, so `find` must match the WHOLE specifier — a trailing
      // regex like /baraka-logo\.webp$/ would leave "./assets/" in front
      // of the absolute path and break the build. An exact string find
      // replaces the entire "./assets/baraka-logo.webp" specifier.
      { find: "./assets/baraka-logo.webp", replacement: logoDataPath },
    ],
  },
  build: {
    outDir: "dist",
  },
});
