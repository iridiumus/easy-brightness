# Architecture

## Components

- `applet.js`
  Cinnamon applet UI and interaction logic.
  Handles mode toggling, custom sliders, helper process calls, retry behavior, and tooltip/icon updates.

- `easy-brightness-helper.c`
  Native helper binary using `libddcutil` for monitor detection and VCP read/write.
  Exposes JSON output for the applet.

- `metadata.json`
  Cinnamon applet metadata (UUID, name, description, version, website).

- `settings-schema.json`
  Applet settings schema (day/night values, debounce, custom mode state).

- `po/`
  Translation catalog template (`.pot`) and language files (`.po`).

## Runtime Flow

1. Applet starts and binds settings.
2. Current mode determines target brightness/blue values.
3. Applet invokes helper command (`set`, `set-blue`) asynchronously.
4. Helper applies values to all detected displays and returns JSON result.
5. Applet retries failed writes up to configured retry limits.

## Packaging

- Local install: `make install` to user-local Cinnamon applet path.
- Debian package: `scripts/build_deb.sh` creates `dist/*.deb`.
- GitHub release workflow builds and publishes `.deb` on version tags.
