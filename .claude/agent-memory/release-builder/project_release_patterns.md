---
name: Release patterns and conventions
description: How releases are structured, where artifacts live, and conventions observed across release runs
type: project
---

Release notes are stored in `RELEASE_NOTES.md` at the repo root and are bundled into the Electron package (listed under `"files"` in the `"build"` section of `package.json`).

Format: plain Markdown with `# Release Notes` header, then `Version vX.Y.Z — Month D, YYYY`, followed by `##` section headers (no emoji in section headers based on prior release). Each section is prose bullet points, user-facing language. A NOTE callout is used at the end of sections with caveats about data availability.

The `build:linux` script re-runs the full build before packaging — so running `npm run build` separately before `build:linux` does the build twice. This is by design (no optimization needed).

Artifact output directory: `dist_out/`
- Linux AppImage: `dist_out/ArcBridge-{version}.AppImage`
- Windows NSIS installer: `dist_out/ArcBridge-{version}-Setup.exe` (cross-compile not available on Linux)

Version tag pattern: `v{semver}` (e.g. `v1.41.0`). Tags are created manually by the user after the release build.

The chunk-size warnings from Vite (index.js > 500 kB) are pre-existing and non-blocking — do not treat them as errors.

**Why:** This documents conventions discovered during the first release run so future runs don't need to re-discover them.

**How to apply:** Follow this format when writing release notes; expect two full build passes when using `build:linux`; check `dist_out/` for artifacts.
