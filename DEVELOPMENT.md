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
- Some monitors may need repeated writes; retries are handled in applet logic.
