# Architecture

## Components

- `applet.js`
  Cinnamon applet UI and interaction logic.
  Handles mode toggling, custom sliders (brightness/contrast/volume), helper process calls, adaptive per-display state machines, and tooltip/icon updates.

- `easy-brightness-helper.c`
  Native helper binary using `libddcutil` for monitor detection and VCP read/write.
  Exposes JSON output for `detect` and per-bus get/set commands for brightness, contrast, volume, mute, and legacy compatibility.

- `metadata.json`
  Cinnamon applet metadata (UUID, name, description, version, website).

- `settings-schema.json`
  Applet settings schema (day/night brightness/contrast values, independent volume state, debounce, custom mode state, hidden legacy compatibility values).

- `po/`
  Translation catalog template (`.pot`) and language files (`.po`).

## Runtime Flow

1. Applet starts and binds settings.
2. Current mode determines target brightness/contrast values and volume is kept independent.
3. Applet requests monitor list via helper command (`detect`).
4. Applet selects a per-display state machine by detected monitor kind (`audio`, `legacy`, or generic fallback).
5. Profile stages call helper per-bus commands for the detected monitor kind with retries managed in applet logic.
6. Volume uses its own state machine and applies `0x62` volume plus `0x8D` mute to all audio-capable displays.

## Packaging

- Local install: `make install` to user-local Cinnamon applet path.
- Debian package: `scripts/build_deb.sh` creates `dist/*.deb`.
- GitHub release workflow builds and publishes `.deb` on version tags.
