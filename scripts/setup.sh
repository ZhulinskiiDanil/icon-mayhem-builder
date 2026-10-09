#!/usr/bin/env bash
# Everything a build needs, on the volume, made once and kept: the Android NDK, the Geode SDK (at the
# version the mod asks for) with its binaries, the Windows SDK and cross toolchain, a CLI profile.
# Usage: setup.sh <geode version>
set -euo pipefail

GEODE_VERSION="$1"
DATA="${DATA_DIR:-/data}"
export HOME="$DATA/home"
export GEODE_SDK="$DATA/geode-sdk"
NDK_VERSION="r29"
mkdir -p "$HOME" "$DATA"

# Android NDK
if [ ! -f "$DATA/android-ndk/build/cmake/android.toolchain.cmake" ]; then
  echo "== Downloading the Android NDK $NDK_VERSION"
  rm -rf "$DATA/android-ndk" "$DATA/ndk.zip"
  curl -fsSL -o "$DATA/ndk.zip" "https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-linux.zip"
  unzip -q "$DATA/ndk.zip" -d "$DATA"
  mv "$DATA/android-ndk-${NDK_VERSION}" "$DATA/android-ndk"
  rm "$DATA/ndk.zip"
fi

# Geode SDK
if [ ! -d "$GEODE_SDK/.git" ]; then
  echo "== Installing the Geode SDK"
  rm -rf "$GEODE_SDK"
  env -u GEODE_SDK geode sdk install "$GEODE_SDK" < /dev/null
fi

# A profile: the CLI wants one, the builds don't install anywhere
if ! geode profile list 2>/dev/null | grep -q "Railway"; then
  mkdir -p "$DATA/gd/geode/mods"
  geode profile add --name Railway "$DATA/gd/GeometryDash.exe" win < /dev/null
fi

# The SDK version of the mod, with the loader binaries of each platform
if [ "$(cat "$GEODE_SDK/.railway-version" 2>/dev/null || true)" != "$GEODE_VERSION" ]; then
  echo "== Geode SDK $GEODE_VERSION"
  geode sdk update "$GEODE_VERSION" < /dev/null
  for platform in win android32 android64; do
    geode sdk install-binaries --platform "$platform" --version "$GEODE_VERSION" < /dev/null
  done
  echo "$GEODE_VERSION" > "$GEODE_SDK/.railway-version"
fi

# Windows SDK and the clang-cl toolchain
if [ ! -f "$HOME/.local/share/Geode/cross-tools/clang-msvc-sdk/clang-msvc.cmake" ] || [ ! -d "$HOME/.local/share/Geode/cross-tools/splat" ]; then
  echo "== Installing the Windows cross tools"
  geode sdk install-linux < /dev/null
fi

echo "== Ready"
