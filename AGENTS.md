# AGENTS Contract

This file is the operational contract for AI agents and contributors working in this repository.

## Scope

- Repository: `easy-brightness`
- Primary language for docs and code comments: English
- Source of truth for process rules: this `AGENTS.md`

## Safe Defaults (Allowed Without Extra Approval)

- Read repository files
- Run non-destructive local checks (`make verify`, build, lint)
- Add or update code/docs/tests needed for the task

## Explicit Approval Required

- Publishing tags or releases
- Changing CI secrets or credentials
- Destructive Git operations (`reset --hard`, force-push, history rewrite)
- Infrastructure changes outside repository scope

## Mandatory Local Run Order

Run these checks in order before release-related actions:

```bash
make format-check
make lint
make test
```

## Hard Prohibitions

- Bypassing blocking checks in CI
- Merging behavior changes without docs updates in the same change
- Silent dependency changes without documenting runtime/build impact

## Code-Docs Sync Contract

Any behavior or public configuration change must update relevant documentation in the same commit:
- `README.md`
- `ARCHITECTURE.md`
- `DEVELOPMENT.md`
- `RELEASE.md`
- `CHANGELOG.md` (for user-facing changes)

## Versioning and Releases

- SemVer is required (`x.y.z`).
- `metadata.json` version and top `CHANGELOG.md` entry must match.
- Release readiness command:

```bash
make release-check
```
