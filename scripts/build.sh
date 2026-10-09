#!/usr/bin/env bash
# One commit of the mod, built for Windows and Android and merged into one .geode.
# Usage: build.sh <repo url> <commit> <output dir>
set -euo pipefail

REPO_URL="$1"
COMMIT="$2"
OUT="$3"
DATA="${DATA_DIR:-/data}"
SRC="$DATA/repo"
export HOME="$DATA/home"
export GEODE_SDK="$DATA/geode-sdk"
export CPM_SOURCE_CACHE="$DATA/cpm"
export CCACHE_DIR="$DATA/ccache"
export CCACHE_MAXSIZE="${CCACHE_MAXSIZE:-3G}"
# Paths differ between commits only in the build folders: let ccache share across them
export CCACHE_BASEDIR="$DATA"
mkdir -p "$OUT" "$CPM_SOURCE_CACHE" "$CCACHE_DIR"
started=$(date +%s)

# The commit
if [ ! -d "$SRC/.git" ]; then
  git clone --quiet "$REPO_URL" "$SRC"
fi
git -C "$SRC" fetch --quiet --force origin "$COMMIT" || git -C "$SRC" fetch --quiet --force origin
git -C "$SRC" checkout --quiet --force "$COMMIT"
git -C "$SRC" clean -fdxq
echo "== $(git -C "$SRC" log -1 --format='%h %s')"

MOD_ID=$(jq -r '.id' "$SRC/mod.json")
GEODE_VERSION=$(jq -r '.geode' "$SRC/mod.json")
"$(dirname "$0")/setup.sh" "$GEODE_VERSION"

NDK="$DATA/android-ndk"
CROSS="$HOME/.local/share/Geode/cross-tools"
COMMON=(-G Ninja -DCMAKE_BUILD_TYPE=Release -DGEODE_DONT_INSTALL_MODS=ON -DCMAKE_INTERPROCEDURAL_OPTIMIZATION=ON
        "-DGEODE_CODEGEN_CMAKE_ARGS=-DCMAKE_C_COMPILER=clang;-DCMAKE_CXX_COMPILER=clang++;-G Ninja"
        -DCMAKE_C_COMPILER_LAUNCHER=ccache -DCMAKE_CXX_COMPILER_LAUNCHER=ccache)

build() {
  local target="$1" name="$2"
  shift 2
  local dir="$DATA/build/$name"
  local step=$(date +%s)
  echo "== $target"
  cmake -S "$SRC" -B "$dir" "${COMMON[@]}" -DGEODE_TARGET_PLATFORM="$target" "$@" > "$OUT/$name.configure.log" 2>&1 \
    || { cat "$OUT/$name.configure.log"; return 1; }
  cmake --build "$dir" --parallel
  cp "$dir/$MOD_ID.geode" "$OUT/$name.geode"
  echo "== $target done in $(( $(date +%s) - step ))s"
}

build Win64 win \
  -DCMAKE_TOOLCHAIN_FILE="$CROSS/clang-msvc-sdk/clang-msvc.cmake" -DSPLAT_DIR="$CROSS/splat" -DHOST_ARCH=x86_64
build Android64 android64 \
  -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" -DANDROID_STL=c++_shared -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-23
build Android32 android32 \
  -DCMAKE_TOOLCHAIN_FILE="$NDK/build/cmake/android.toolchain.cmake" -DANDROID_STL=c++_shared -DANDROID_ABI=armeabi-v7a -DANDROID_PLATFORM=android-23

# One file for all three (the merge goes into the first file)
cp "$OUT/win.geode" "$OUT/$MOD_ID.geode"
geode package merge "$OUT/$MOD_ID.geode" "$OUT/android64.geode" "$OUT/android32.geode" < /dev/null
echo "== Built $MOD_ID.geode in $(( $(date +%s) - started ))s"
ccache --show-stats --verbose 2>/dev/null | grep -E "Hits|Misses" | head -4 || true
