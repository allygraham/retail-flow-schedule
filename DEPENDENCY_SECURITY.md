# Dependency security review — 6 October 2026

Updated Vite, Vitest, React Router, PostCSS and compatible transitive dependencies.
Removed the development-only Lovable component tagger.

The audit fell from 26 affected packages (including one critical) to seven high
reports, all propagated from a single unpatched `braces` advisory:
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

The affected chain is Tailwind 3 / typography / animate → chokidar or fast-glob /
micromatch → braces. Deeply nested untrusted glob patterns can exhaust the Node
stack. These dependencies process repository-controlled styles and file patterns
at build time; they are not bundled into the browser app. Do not feed untrusted
patterns into the build configuration. A Tailwind 4 migration would replace this
chain but requires separate styling migration and visual regression work.

`npm run audit:security` fails on any other advisory, including new low or moderate
advisories, and fails if the registry cannot return a valid audit. The exception
matches this exact advisory URL, not a package name or severity. Remove it when
an upstream patch is available or the affected dependency chain is removed.

The deployment gate caught a newly reported `postcss-selector-parser` advisory
(GHSA-rj75-hqrm-r3gf). All Tailwind and typography paths now use patched version
7.1.6 through npm overrides, including an explicit `postcss-nested` override.
These overrides cross the upstream version-6 ranges; production CSS builds and
browser regression checks must pass when changing them. Remove the overrides
when upstream dependencies adopt a patched parser themselves.
