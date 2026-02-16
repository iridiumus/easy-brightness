# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-02-15

- Initial public release of Easy Brightness Cinnamon applet.
- Added day/night/custom profile switching from panel icon.
- Added native `libddcutil` helper for brightness, contrast, and blue gain control.
- Added applet-side per-display apply state machine (`init -> set_brightness -> set_contrast -> set_blue`) using helper per-bus commands.
- Added day/night/custom contrast settings and custom contrast slider in applet menu.
- Added translation infrastructure (`po/`, gettext integration, Russian translation).
- Added Debian package build script and GitHub Actions CI/release workflows.
- Added contributor, development, architecture, release, and security documentation.
