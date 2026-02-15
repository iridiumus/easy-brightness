# Contributing

## Workflow

1. Create a feature/fix branch.
2. Keep changes focused and include tests/check updates when applicable.
3. Update documentation in the same change when behavior changes.
4. Run `make verify` before opening a PR.

## Commit Messages

Use clear imperative subject lines, for example:

- `Add gettext support for applet tooltips`
- `Add GitHub release workflow for .deb packages`

## Pull Requests

Each PR should include:

- What changed
- Why it changed
- How it was validated (`make verify`, package build, etc.)
- Docs impact

## Coding Notes

- Keep runtime strings translatable.
- Preserve compatibility with Cinnamon applet environment (GJS).
- Avoid introducing hard dependencies unless documented in `README.md`.
