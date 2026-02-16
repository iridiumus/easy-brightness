# Changelog

All notable changes to this project are documented in this file.

## [1.1.0] - 2026-02-16

- Added contrast control across day/night/custom profiles and custom menu slider.
- Moved apply state machine to applet with per-display stages and retries.
- Refactored helper to single-command execution via detect and per-bus get/set commands.
- Updated package metadata and project docs for contrast-aware workflow.

## [1.0.0] - 2026-02-15

- Initial public release of Easy Brightness Cinnamon applet.
- Added day/night/custom profile switching from panel icon.
- Added native `libddcutil` helper for brightness and blue gain control.
- Added translation infrastructure (`po/`, gettext integration, Russian translation).
- Added Debian package build script and GitHub Actions CI/release workflows.
- Added contributor, development, architecture, release, and security documentation.
