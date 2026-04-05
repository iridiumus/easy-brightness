# Development

## Prerequisites

Ubuntu/Debian example:

```bash
sudo apt-get update
sudo apt-get install -y gcc make libddcutil-dev gettext shellcheck cppcheck clang-format shfmt
```

## Build

```bash
make build
```

## Local Install

```bash
make install
```

## Validation

```bash
make verify
```

## Useful Commands

```bash
make compile-mo
make package
make clean
```

## Hardware Notes

- DDC/CI must be enabled in monitor settings.
- New monitors are expected to expose brightness (`0x10`), contrast (`0x12`), speaker volume (`0x62`), and audio mute (`0x8D`).
- Legacy monitors may still rely on a compatibility channel internally; the app keeps that path for compatibility.
- Some monitors may need repeated writes; retries are handled by applet state-machine stages.
