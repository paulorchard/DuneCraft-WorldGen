#!/usr/bin/env bash
# Real-generator preview: writes the current graph into a scratch copy of the pack and renders it with the game's classes.
# usage: tools/preview/real.sh <seed> <out.png> [centreX centreZ sizeMetres metresPerPixel]
set -e
here="$(cd "$(dirname "$0")" && pwd)"; root="$(cd "$here/../.." && pwd)"
JAVA="${JAVA_HOME:-$HOME/.jdks/loom-ea-25-loom+1-11}/bin/java"
JAR="$APPDATA/Hytale/install/release/package/game/latest/Server/HytaleServer.jar"
pack="$here/out/pack"; rm -rf "$pack"; mkdir -p "$pack/Server"
cp -r "$root/src/main/resources/Server/HytaleGenerator" "$pack/Server/"
# EXTRA_DENSITY: a folder of shared Density assets (e.g. the game's own) to load alongside the pack, for biomes that import them
[ -z "$EXTRA_DENSITY" ] || { mkdir -p "$pack/Server/HytaleGenerator/Density"; cp -r "$EXTRA_DENSITY"/. "$pack/Server/HytaleGenerator/Density/"; }
[ -n "$NO_WRITE" ] || node "$here/write.js" "$pack/Server/HytaleGenerator/Biomes/Arrakis/Arrakis_Terrain.json" >/dev/null
seed="$1"; out="$2"; shift 2
"$JAVA" -cp "$(cygpath -w "$JAR")" "$(cygpath -w "$here/RealPreview.java")" "$(cygpath -w "$pack")" "$seed" "$(cygpath -w "$out")" "$@" >"$out.stdout" 2>&1 || { tail -5 "$out.log"; exit 1; }
tail -1 "$out.log"
