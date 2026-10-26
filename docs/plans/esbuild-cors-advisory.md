# esbuild dev-server CORS advisory (Dependabot)

Status: approved by Rohit 26 Oct 2026. Canvas: not applicable (dependency change only, nothing in the app changes);
skipping it approved by Rohit 26 Oct 2026.

## The alert

GitHub advisory GHSA-67mh-4wv8-2f99: esbuild `<= 0.24.2` sends `Access-Control-Allow-Origin: *` from its built-in
dev server (`esbuild.serve()`), so any website can read files that server is serving. Patched in `0.25.0`.

## Where it comes from

The lockfile has three esbuild versions: `0.18.20`, `0.25.12` and `0.28.2`. Only `0.18.20` is affected, and it comes
from one chain, all dev-only:

```
packages/db  ->  drizzle-kit 0.31.11  ->  @esbuild-kit/esm-loader 2.6.5  ->  @esbuild-kit/core-utils 3.3.2  ->  esbuild 0.18.20
```

`@esbuild-kit/*` is deprecated (merged into tsx) and the latest drizzle-kit still pulls it, so upgrading drizzle-kit
does not fix it.

## Real risk

Low. The bug is only in `esbuild.serve()`. drizzle-kit uses esbuild to load the TypeScript schema, never to serve
anything, and none of this ships in the web, API or Mac builds. Vite runs its own dev server, not esbuild's. We fix it
anyway so the alert closes and the audit stays clean.

## The change

Add a pnpm override in the root `package.json` that pins only that chain to the patched line:

```json
"pnpm": {
  "overrides": {
    "@esbuild-kit/core-utils>esbuild": "^0.25.0"
  }
}
```

Then `pnpm install` to rewrite `pnpm-lock.yaml`. The override is scoped to `@esbuild-kit/core-utils`, so Vite, tsx and
drizzle-kit keep the esbuild they already resolve. `core-utils` only calls `transform`/`transformSync`, which kept the
same API from 0.18 to 0.25.

## Test scenarios

No new automated tests: this changes no app code. Checks, run on Rohit's Mac:

1. `pnpm install` succeeds and `grep -n "esbuild@0.18" pnpm-lock.yaml` returns nothing.
2. `pnpm why esbuild` shows no version below 0.25.
3. `pnpm --filter @tudu/db generate` still loads the schema and reports no schema changes (proves drizzle-kit works on
   the newer esbuild).
4. `pnpm verify` passes (lint, typecheck, unit tests).
5. CI passes on the PR, including the API Docker image build, which runs migrations.
6. After merge, the Dependabot alert closes on its own.
