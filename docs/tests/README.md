# Tests

One file per chunk lists its cases: the id, what it checks and the scenario. `STATUS.md` is generated from the last
run by `pnpm test:status`. A case id appears in the name of the test that covers it, so the status page can find it.

| Level      | Where                                          | Run                                                   |
| ---------- | ---------------------------------------------- | ----------------------------------------------------- |
| Unit       | `packages/*/src/**/*.test.ts(x)`               | `pnpm test`, or `pnpm test -- --project ui`           |
| API        | `apps/server/src/**/*.test.ts` (from chunk 01) | `pnpm test -- --project server`                       |
| End-to-end | `packages/e2e/tests/<group>/`                  | `pnpm e2e`, `pnpm e2e <group>`, `pnpm e2e -g C00-E01` |
| Desktop    | `packages/e2e/mac/tests/` (from chunk 11)      | `pnpm e2e:mac`, `pnpm e2e:mac -g C11-D03`             |

Ids: `Cnn-Uxx` unit, `Cnn-Axx` API, `Cnn-Exx` end-to-end, `Cnn-Dxx` desktop (the real macOS app, Tudu Test, driven
over its control channel), where `nn` is the chunk.
