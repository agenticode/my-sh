#!/bin/sh
# Installs MemorY, the read-only memory error analysis tool (https://my.sh).
#
#   curl -fsSL https://my.sh/get | sh
#
# Steps:
#   1. Picks the archive for this machine: linux/amd64, linux/arm64 or darwin/arm64.
#   2. Reads the current version from https://my.sh/release.json, or takes MY_VERSION.
#   3. Downloads the archive and SHA256SUMS of that version from the GitHub release
#      (https://github.com/agenticode/my/releases) over HTTPS.
#   4. Compares the SHA-256 of the archive with SHA256SUMS and, for the current
#      version, with release.json. On a difference it stops and installs nothing.
#   5. Puts the binary my in $HOME/.local/bin, or in MY_INSTALL_DIR, and runs
#      my version.
#
# It does not use sudo and does not edit shell startup files. When the directory
# is not in PATH, it prints the line to add. Downloads go to a temporary
# directory that is removed at the end.
#
#   MY_VERSION=v1.0.0     install this version
#   MY_INSTALL_DIR=DIR    install into DIR
#
# Source: https://github.com/agenticode/my-sh/blob/main/site/get.sh

set -eu

site=https://my.sh
releases=https://github.com/agenticode/my/releases/download

tmp=
partial=

say() { printf '%s\n' "$*"; }
die() {
	printf 'my install: %s\n' "$*" >&2
	exit 1
}

cleanup() {
	if [ -n "$partial" ]; then rm -f "$partial"; fi
	if [ -n "$tmp" ]; then rm -rf "$tmp"; fi
}

# fetch URL FILE: HTTPS only, fails on an HTTP error.
fetch() {
	if command -v curl >/dev/null 2>&1; then
		curl -fsSL --proto '=https' --retry 2 -o "$2" "$1"
	elif command -v wget >/dev/null 2>&1; then
		if wget --help 2>&1 | grep -q -- --https-only; then
			wget -q --https-only -O "$2" "$1"
		else
			wget -q -O "$2" "$1"
		fi
	else
		die "needs curl or wget"
	fi
}

# sha256 FILE: prints the SHA-256 of FILE in hex.
sha256() {
	case $hasher in
	sha256sum) sha256sum "$1" ;;
	shasum) shasum -a 256 "$1" ;;
	openssl) openssl dgst -sha256 -r "$1" ;;
	esac | cut -d ' ' -f 1
}

# is_sum TEXT: true for 64 lowercase hex digits.
is_sum() {
	case $1 in
	'' | *[!0-9a-f]*) return 1 ;;
	esac
	[ ${#1} -eq 64 ]
}

main() {
	os=$(uname -s)
	arch=$(uname -m)
	case $os in
	Linux) os=linux ;;
	Darwin) os=darwin ;;
	esac
	case $arch in
	x86_64 | amd64) arch=amd64 ;;
	aarch64 | arm64) arch=arm64 ;;
	esac
	# A shell under Rosetta on an Apple silicon Mac reports x86_64.
	if [ "$os/$arch" = darwin/amd64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
		arch=arm64
	fi
	case $os/$arch in
	linux/amd64 | linux/arm64 | darwin/arm64) ;;
	*) die "no archive for $(uname -s) $(uname -m). Archives exist for linux/amd64, linux/arm64 and darwin/arm64; to build from source see $site/download/" ;;
	esac

	if command -v sha256sum >/dev/null 2>&1; then
		hasher=sha256sum
	elif command -v shasum >/dev/null 2>&1; then
		hasher=shasum
	elif command -v openssl >/dev/null 2>&1; then
		hasher=openssl
	else
		die "needs sha256sum, shasum or openssl to check the download"
	fi

	dir=${MY_INSTALL_DIR:-}
	if [ -z "$dir" ]; then
		[ -n "${HOME:-}" ] || die "HOME is not set; set MY_INSTALL_DIR"
		dir=$HOME/.local/bin
	fi
	case $dir in
	?*/) dir=${dir%/} ;;
	esac

	tmp=$(mktemp -d 2>/dev/null || mktemp -d -t my-install) || die "cannot create a temporary directory"
	trap cleanup EXIT
	trap 'exit 1' HUP INT TERM

	if [ -n "${MY_VERSION:-}" ]; then
		version=$MY_VERSION
		case $version in
		v*) ;;
		*) version=v$version ;;
		esac
		listed=
	else
		fetch "$site/release.json" "$tmp/release.json" || die "could not download $site/release.json"
		version=$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp/release.json" | head -n 1)
		[ -n "$version" ] || die "$site/release.json names no version"
		listed=1
	fi
	case $version in
	*[!A-Za-z0-9.+-]*) die "not a version: $version" ;;
	v[0-9]*.[0-9]*.[0-9]*) ;;
	*) die "not a version: $version (the form is v1.0.0)" ;;
	esac

	name=my_${version}_${os}_${arch}
	archive=$name.tar.gz
	say "MemorY $version for $os/$arch"
	fetch "$releases/$version/$archive" "$tmp/$archive" ||
		die "could not download $releases/$version/$archive (releases: https://github.com/agenticode/my/releases)"
	fetch "$releases/$version/SHA256SUMS" "$tmp/SHA256SUMS" ||
		die "could not download $releases/$version/SHA256SUMS"

	got=$(sha256 "$tmp/$archive")
	is_sum "$got" || die "could not compute the SHA-256 of $archive"
	want=$(awk -v f="$archive" '$2 == f || $2 == "*" f { print $1; exit }' "$tmp/SHA256SUMS")
	is_sum "$want" || die "SHA256SUMS has no checksum for $archive; nothing installed"
	[ "$got" = "$want" ] ||
		die "checksum mismatch: SHA256SUMS says $want, the downloaded $archive has $got; nothing installed"
	checked="SHA256SUMS"
	if [ -n "$listed" ]; then
		pattern=$(printf '%s' "$archive" | sed 's/[.]/\\./g')
		pinned=$(sed -n "/\"file\":[[:space:]]*\"$pattern\"/s/.*\"sha256\":[[:space:]]*\"\([0-9a-f]*\)\".*/\1/p" "$tmp/release.json" | head -n 1)
		is_sum "$pinned" || die "$site/release.json has no checksum for $archive; nothing installed"
		[ "$got" = "$pinned" ] ||
			die "checksum mismatch: $site/release.json says $pinned, the downloaded $archive has $got; nothing installed"
		checked="SHA256SUMS and release.json"
	fi
	say "SHA-256 $got matches $checked"

	mkdir "$tmp/x"
	tar -xzf "$tmp/$archive" -C "$tmp/x" || die "could not unpack $archive"
	[ -f "$tmp/x/$name/my" ] || die "$archive holds no $name/my"

	mkdir -p "$dir" || die "could not create $dir; set MY_INSTALL_DIR to a directory you can write to"
	case $dir in
	/*) ;;
	*) dir=$(cd "$dir" && pwd) ;;
	esac
	[ -w "$dir" ] || die "cannot write to $dir; set MY_INSTALL_DIR to a directory you can write to"
	partial=$dir/.my.install.$$
	cp "$tmp/x/$name/my" "$partial" || die "could not copy my into $dir"
	chmod 755 "$partial" || die "could not make $partial executable"
	out=$("$partial" version 2>&1 </dev/null) || die "the downloaded my does not run in $dir: $out"
	mv -f "$partial" "$dir/my" || die "could not move my into $dir"
	partial=
	say "Installed $dir/my"

	case ":${PATH:-}:" in
	*":$dir:"*) ;;
	*)
		say ""
		say "$dir is not in your PATH. Add this line to your shell startup file (~/.profile, ~/.bashrc or ~/.zshrc):"
		if [ "$dir" = "${HOME:-}/.local/bin" ]; then
			# shellcheck disable=SC2016 # the line is printed for the user's profile
			say '  export PATH="$HOME/.local/bin:$PATH"'
		else
			say "  export PATH=\"$dir:\$PATH\""
		fi
		say ""
		;;
	esac
	found=$(command -v my 2>/dev/null || true)
	if [ -n "$found" ] && [ "$found" != "$dir/my" ]; then
		say "Note: $found comes before $dir/my in your PATH."
	fi

	"$dir/my" version </dev/null
}

main "$@"
