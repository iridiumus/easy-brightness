# Architecture

## Components

- `applet.js`
  Cinnamon applet UI and interaction logic.
  Handles mode toggling, custom sliders (brightness/contrast/blue), helper process calls, retry behavior, and tooltip/icon updates.

- `easy-brightness-helper.c`
  Native helper binary using `libddcutil` for monitor detection and VCP read/write.
  Exposes JSON output for `detect` and per-bus get/set commands.

- `metadata.json`
  Cinnamon applet metadata (UUID, name, description, version, website).

- `settings-schema.json`
  Applet settings schema (day/night brightness/contrast/blue values, debounce, custom mode state).

- `po/`
  Translation catalog template (`.pot`) and language files (`.po`).

## Runtime Flow

1. Applet starts and binds settings.
2. Current mode determines target brightness/contrast/blue values.
3. Applet requests monitor list via helper command (`detect`).
4. Applet runs per-display state machine (`init -> set_brightness -> set_contrast -> set_blue -> done|failed`).
5. Each stage calls helper per-bus commands (`set-bus`, `set-contrast-bus`, `set-blue-bus`) with retries managed in applet logic.

## Packaging

- Local install: `make install` to user-local Cinnamon applet path.
- Debian package: `scripts/build_deb.sh` creates `dist/*.deb`.
- GitHub release workflow builds and publishes `.deb` on version tags.
