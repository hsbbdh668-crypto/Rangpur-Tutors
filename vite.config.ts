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
//  - Aliases both Hatch SDK entry points to client/vercel-shim.ts, so
//    the existing client files (api.ts, App.tsx, main.tsx) build unchanged:
//    the shim's createActionClient returns the REST client, and its
//    spaceQueryClient / SafeAreaTopScrim / setFailureNoticeText stand in
//    for the SDK's.
//  - Aliases the binary logo import to the tiny URL module
//    (client/src/assets/baraka-logo.url.ts) and emits the real
//    baraka-logo.webp into dist from the text-only base64 module
//    (client/src/assets/baraka-logo.data.ts), so the repo stays 100%
//    text files for the GitHub push — the .webp itself is never needed
//    by this build, and the ~122KB base64 stays out of the JS bundle.
//  - Emits the favicon at build time (barakaFavicon plugin below): it
//    decodes client/src/assets/favicon.data.ts (base64 text, logo #4)
//    into real favicon.png + favicon.ico in client/dist, and swaps the
//    empty Hatch icon link in client/index.html for real favicon links.
//    The source index.html keeps its empty `data:,` icon on purpose —
//    the Hatch artifact must not fetch /favicon.ico outside the space's
//    routes (see the comment in client/index.html). The binary favicon
//    files are never stored in the repo: the GitHub snapshot push
//    rejects binary files, so only the base64 text module is pushed.
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
import {
  FAVICON_PNG_BASE64,
  FAVICON_ICO_BASE64,
} from "./client/src/assets/favicon.data";
import BARAKA_LOGO_DATA_URI from "./client/src/assets/baraka-logo.data";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(repoRoot, "client");
const shimPath = resolve(clientDir, "vercel-shim.ts");
const logoUrlPath = resolve(clientDir, "src/assets/baraka-logo.url.ts");

// Favicon + logo for the Vercel build only (logo #4, see favicon.data.ts
// and baraka-logo.data.ts).
// The source client/index.html deliberately keeps its empty `data:,`
// icon so the Hatch artifact never fetches /favicon.ico outside the
// space's routes. This plugin, which runs only in the Vite/Vercel
// build, emits real favicon files into dist and rewrites the built
// index.html to link them. It also emits baraka-logo.webp into dist:
// App.tsx's logo import is aliased (below) to the tiny URL module
// client/src/assets/baraka-logo.url.ts, so the ~122KB base64 logo stays
// out of the JS bundle and loads as a separate cacheable file instead.
// The binary favicon/logo files are never stored in the repo: the
// GitHub snapshot push rejects binary files, so only the base64 text
// modules are pushed.
function barakaFavicon() {
  return {
    name: "baraka-favicon",
    transformIndexHtml(html: string) {
      // The matched tag already carries the line's leading indent, so
      // only the continuation lines get their own indent here.
      const faviconLinks =
        '<link rel="icon" type="image/png" href="/favicon.png" />\n' +
        '    <link rel="icon" type="image/x-icon" href="/favicon.ico" />\n' +
        '    <link rel="apple-touch-icon" href="/favicon.png" />';
      const replaced = html.replace(
        /<link rel="icon" href="data:," \/>/,
        faviconLinks,
      );
      return replaced === html ? null : replaced;
    },
    generateBundle(this: { emitFile: (f: unknown) => void }) {
      const png = Buffer.from(FAVICON_PNG_BASE64, "base64");
      const ico = Buffer.from(FAVICON_ICO_BASE64, "base64");
      this.emitFile({ type: "asset", fileName: "favicon.png", source: png });
      this.emitFile({ type: "asset", fileName: "favicon.ico", source: ico });
      const logoB64 = BARAKA_LOGO_DATA_URI.replace(/^data:image\/webp;base64,/, "");
      const logo = Buffer.from(logoB64, "base64");
      this.emitFile({ type: "asset", fileName: "baraka-logo.webp", source: logo });
    },
  };
}

function hatchMacroRewrite() {
  return {
    name: "baraka-hatch-macro-rewrite",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (!id.endsWith("client/src/App.tsx")) return null;
      if (!code.includes("@hatch/space-sdk/fields")) return null;
      const rewritten = code.replace(
        /import\s*\{\s*actionFields\s*\}\s*from\s*"@hatch\/space-sdk\/fields"\s*with\s*\{\s*type:\s*"macro"\s*\}\s*;/,
        `import { actionFields } from ${JSON.stringify(shimPath)};`,
      );
      return rewritten === code ? null : rewritten;
    },
  };
}

export default defineConfig({
  root: clientDir,
  plugins: [hatchMacroRewrite(), barakaFavicon(), react(), tailwindcss()],
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
      { find: "./assets/baraka-logo.webp", replacement: logoUrlPath },
    ],
  },
  build: {
    outDir: "dist",
    // The site targets modern mobile/desktop browsers, all well past
    // es2022.
    target: "es2022",
  },
});
