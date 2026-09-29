## Summary

<!-- What changed and why -->

## Test impact

| Changed unit | Test file | Add / edit / delete | Result |
|--------------|-----------|---------------------|--------|
| | | | `pnpm verify` |

<!-- For UI or API changes, run `pnpm test:e2e` locally when E2E_DATABASE_URL is set; CI E2E is scheduled only -->

## Checklist

- [ ] `pnpm verify` passes locally (includes `test:db` on CI unit job)
- [ ] E2E specs updated when behavior is user-visible (`apps/e2e/tests/`); run `pnpm test:e2e` locally when possible
- [ ] No em-dash in copy or comments
