# Easy Brightness

Easy Brightness is a Cinnamon applet for fast DDC/CI control of external monitor brightness, contrast, and audio volume.

The applet provides three modes from the panel icon:
- Day profile
- Night profile
- Custom profile (editable from the applet context menu)

## Features

- One-click day/night switch from the Cinnamon panel
- Day/night presets for brightness and contrast
- Independent volume slider in applet menu with mute at zero
- Multi-monitor support through `libddcutil`
- Auto-detected monitor profiles with applet-driven per-display state machines
- Legacy compatibility remains available for older displays
- Translation-ready UI with Cinnamon `po/` structure

## Runtime Requirements

- Cinnamon desktop environment
- External monitor(s) with DDC/CI enabled in monitor OSD
- `ddcutil`
- `libddcutil4`
- Access to I2C devices (usually via `i2c-dev` group / permissions)

## Build Requirements

- `gcc`
- `make`
- `libddcutil-dev`
- `gettext` (for `.mo` compilation)

## Local Installation (User Scope)

```bash
make install
```

This installs applet files to:
- `~/.local/share/cinnamon/applets/easy-brightness@iridiumus`

and translations to:
- `~/.local/share/locale/<lang>/LC_MESSAGES/easy-brightness@iridiumus.mo`

## Build Debian Package

```bash
make package
```

or directly:

```bash
./scripts/build_deb.sh
```

Artifacts are created in `dist/`.

## Development Quality Gates

```bash
make format-check
make lint
make test
make verify
```

## Release

Versioning follows SemVer (`x.y.z`) from `metadata.json`.

Before tag/release:

```bash
make changelog-check
make release-check
```

GitHub tag format:

- `v1.0.0`

A tag push triggers `.github/workflows/release.yml` which builds `.deb` and publishes a GitHub release.

## Translations

Translation sources are under `po/`:
- `po/easy-brightness@iridiumus.pot`
- language files such as `po/ru.po`

## License

`GPL-2.0-or-later`.
See `LICENSE`.
