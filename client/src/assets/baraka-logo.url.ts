// Baraka Tutors logo as a plain URL (Vercel build only).
//
// The logo file itself is emitted into client/dist as baraka-logo.webp
// at build time by the plugin in vite.config.ts (decoded from the
// base64 text module client/src/assets/baraka-logo.data.ts, so the repo
// stays 100% text files for the GitHub push). Importing the .webp
// directly would inline ~122KB of base64 into the JS bundle; pointing
// at this URL module keeps the logo a separate, browser-cacheable
// static file instead. The Hatch artifact build does not use this file
// (it imports the real .webp through client/build.mjs).
export default "/baraka-logo.webp";
