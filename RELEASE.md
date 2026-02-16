# Release Process

## Versioning

- SemVer (`MAJOR.MINOR.PATCH`)
- Canonical version source: `metadata.json`
- `CHANGELOG.md` top entry must match `metadata.json` version

## Pre-release Checklist

1. Update `metadata.json` version.
2. Add changelog entry with release date.
3. Run quality gates:

```bash
make release-check
```

4. Ensure `dist/*.deb` is generated successfully.
5. Confirm docs sync for user-facing behavior/config changes (`README.md`, `ARCHITECTURE.md`, `DEVELOPMENT.md`, `CHANGELOG.md`).

## Tag and Publish

Tag format:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Tag push triggers GitHub Actions release workflow:
- Builds `.deb`
- Generates SHA256 checksum
- Publishes GitHub Release assets

## Backport Policy

- Critical fixes may be backported to maintenance branches.
- Backport PRs must reference original fix commit and include changelog notes.
