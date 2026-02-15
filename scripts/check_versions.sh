#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
METADATA_FILE="$ROOT_DIR/metadata.json"
CHANGELOG_FILE="$ROOT_DIR/CHANGELOG.md"

metadata_version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$METADATA_FILE" | head -n 1)"
if [[ -z "$metadata_version" ]]; then
	echo "ERROR: version is missing in metadata.json"
	exit 1
fi

if [[ ! "$metadata_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "ERROR: metadata.json version must follow SemVer (x.y.z), got: $metadata_version"
	exit 1
fi

changelog_version="$(sed -nE 's/^## \[([0-9]+\.[0-9]+\.[0-9]+)\].*/\1/p' "$CHANGELOG_FILE" | head -n 1)"
if [[ -z "$changelog_version" ]]; then
	echo "ERROR: CHANGELOG.md must start with a SemVer heading like: ## [1.0.0] - YYYY-MM-DD"
	exit 1
fi

if [[ "$metadata_version" != "$changelog_version" ]]; then
	echo "ERROR: Version mismatch"
	echo "  metadata.json: $metadata_version"
	echo "  CHANGELOG.md:  $changelog_version"
	exit 1
fi

echo "Version check passed: $metadata_version"
