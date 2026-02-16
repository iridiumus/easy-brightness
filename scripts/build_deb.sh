#!/usr/bin/env bash
set -euo pipefail
umask 022

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

UUID="easy-brightness@iridiumus"
PKG_NAME="easy-brightness"
MAINTAINER="iridiumus"
HOMEPAGE="https://github.com/iridiumus/easy-brightness"

metadata_version="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' metadata.json | head -n 1)"
if [[ -z "$metadata_version" ]]; then
	echo "ERROR: metadata.json does not contain a version"
	exit 1
fi

version="${1:-$metadata_version}"
if [[ "$version" != "$metadata_version" ]]; then
	echo "ERROR: requested package version ($version) does not match metadata.json version ($metadata_version)"
	exit 1
fi

arch="${DEB_ARCH:-$(dpkg --print-architecture)}"
stage_dir="$ROOT_DIR/build/package/${PKG_NAME}_${version}_${arch}"
pkg_root="$stage_dir/root"

applet_dest="$pkg_root/usr/share/cinnamon/applets/$UUID"
doc_dest="$pkg_root/usr/share/doc/$PKG_NAME"
locale_dest="$pkg_root/usr/share/locale"

rm -rf "$stage_dir"
mkdir -p "$pkg_root/DEBIAN" "$applet_dest" "$doc_dest" "$locale_dest" "$ROOT_DIR/dist"

make build compile-mo

install -m 0755 "build/easy-brightness-helper" "$applet_dest/easy-brightness-helper"
install -m 0644 applet.js metadata.json settings-schema.json LICENSE README.md "$applet_dest/"

if [[ -d po ]]; then
	mkdir -p "$applet_dest/po"
	install -m 0644 "po/$UUID.pot" "$applet_dest/po/"
	if compgen -G "po/*.po" >/dev/null; then
		install -m 0644 po/*.po "$applet_dest/po/"
	fi
	if [[ -f "po/LINGUAS" ]]; then
		install -m 0644 "po/LINGUAS" "$applet_dest/po/"
	fi
fi

if compgen -G "build/locale/*/LC_MESSAGES/$UUID.mo" >/dev/null; then
	while IFS= read -r mo_file; do
		lang="$(echo "$mo_file" | sed -E 's#^.*/locale/([^/]+)/LC_MESSAGES/.*$#\1#')"
		install -d "$locale_dest/$lang/LC_MESSAGES"
		install -m 0644 "$mo_file" "$locale_dest/$lang/LC_MESSAGES/$UUID.mo"
	done < <(find build/locale -path "*/LC_MESSAGES/$UUID.mo" -type f | sort)
fi

install -m 0644 CHANGELOG.md "$doc_dest/changelog.md"
install -m 0644 LICENSE "$doc_dest/copyright"

depends="cinnamon, ddcutil, libddcutil4"
cat >"$pkg_root/DEBIAN/control" <<CONTROL
Package: $PKG_NAME
Version: $version
Section: x11
Priority: optional
Architecture: $arch
Maintainer: $MAINTAINER
Depends: $depends
Homepage: $HOMEPAGE
Description: Easy brightness, contrast, and blue gain control applet for Cinnamon
 Switch between day, night and custom display profiles from the Cinnamon panel.
 The applet controls external monitors via DDC/CI using libddcutil.
CONTROL

output_deb="$ROOT_DIR/dist/${PKG_NAME}_${version}_${arch}.deb"
dpkg-deb --build --root-owner-group "$pkg_root" "$output_deb" >/dev/null

echo "Built package: $output_deb"
