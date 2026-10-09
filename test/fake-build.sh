#!/usr/bin/env bash
# Stands in for scripts/build.sh in the dry run: a second of "work", then the files
set -euo pipefail
OUT="$3"
echo "fake build of $2 from $1"
sleep 1
for name in win android64 android32 zhulis.icon-mayhem; do
  echo "geode" > "$OUT/$name.geode"
done
echo "done"
