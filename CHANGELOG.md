# Changelog

All notable changes to this project are documented in this file.

## [1.2.0] - 2026-04-05

- Added automatic monitor-kind detection for audio-capable and legacy displays.
- Replaced the legacy color slider with an independent volume slider that mutes at zero.
- Moved profile application to adaptive applet-side state machines with per-display methods.
- Added audio volume and mute VCP support for the new monitor model.
- Kept legacy compatibility logic as hidden support for older monitors.

## [1.1.0] - 2026-02-16

- Added contrast control across day/night/custom profiles and custom menu slider.
- Moved apply state machine to applet with per-display stages and retries.
- Refactored helper to single-command execution via detect and per-bus get/set commands.
- Updated package metadata and project docs for contrast-aware workflow.

## [1.0.0] - 2026-02-15

- Initial public release of Easy Brightness Cinnamon applet.
- Added day/night/custom profile switching from panel icon.
- Added native `libddcutil` helper for brightness and legacy display control.
- Added translation infrastructure (`po/`, gettext integration, Russian translation).
- Added Debian package build script and GitHub Actions CI/release workflows.
- Added contributor, development, architecture, release, and security documentation.
