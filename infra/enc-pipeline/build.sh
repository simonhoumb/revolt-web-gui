#!/usr/bin/env bash
#
# Builds a single MBTiles vector tileset from the Oslo Fjord DNV S-57 ENC
# delivery.
#
# This script runs inside the Docker image built from this directory's
# Dockerfile. See run.sh for the Docker wrapper and README.md for mounting
# local ENC data.
#
# Pipeline:
#   1. Consolidate each ENC cell's base (.000) and update (.001, .002, ...)
#      files into a working directory.
#   2. Extract selected S-57 feature classes to GeoJSON with updates applied.
#   3. Merge all cells into one GeoJSON per layer.
#   4. Build oslo-fjord.mbtiles with Tippecanoe.
#
# Required mounts:
#   /source  Read-only ENC delivery root (one directory per cell).
#   /data    Read-write working directory and output location.
set -euo pipefail

SOURCE_DIR="/source"
DATA_DIR="/data"
CONSOLIDATED_DIR="$DATA_DIR/consolidated"
GEOJSON_DIR="$DATA_DIR/geojson"
OUTPUT_DIR="$DATA_DIR/output"

# S-57 cells included in the DNV delivery. These cover the outer/southern
# Oslofjord around Horten, Tønsberg, Moss and Åsgårdstrand.
CELLS=(NO4G0821 NO4H0820 NO4H0821 NO5G0821 NO5H0820)

# S-57 feature classes included in the tileset.
#
# Metadata layers (M_QUAL, M_NSYS, DSID) and land-use layers (ROADWY,
# RAILWY, BUAARE) are omitted because they are not needed for the nautical
# chart.
#
# M_COVR is intentionally retained even though it is metadata. Feature 13's
# ENC validation uses it to distinguish "checked and no features found" from
# "no chart coverage", so it is available for queryRenderedFeatures() but is
# never rendered in the MapLibre style.
LAYERS=(
	DEPARE DEPCNT SOUNDG COALNE LNDARE SBDARE SLCONS
	BOYLAT BOYSAW BOYSPP BOYCAR BCNLAT BCNSPP BCNISD
	LIGHTS WRECKS OBSTRN UWTROC RESARE TSSLPT TSSBND TSELNE M_COVR
)

rm -rf "$CONSOLIDATED_DIR" "$GEOJSON_DIR" "$OUTPUT_DIR"
mkdir -p "$CONSOLIDATED_DIR" "$GEOJSON_DIR" "$OUTPUT_DIR"

# -----------------------------------------------------------------------------
# Stage 1: Consolidate ENC base and update files
# -----------------------------------------------------------------------------

echo "== Consolidating cell base + update files =="
for cell in "${CELLS[@]}"; do
	dest="$CONSOLIDATED_DIR/$cell"
	mkdir -p "$dest"

	# This delivery does not use a consistent directory layout, so search each
	# cell recursively for its base and update files.
	found=$(find "$SOURCE_DIR/$cell" -type f -iname "${cell}.0[0-9][0-9]" -exec cp {} "$dest/" \; -print | wc -l)

	echo "$cell: consolidated $found file(s)"
done

# -----------------------------------------------------------------------------
# Stage 2: Extract S-57 layers to GeoJSON
# -----------------------------------------------------------------------------

echo "== Extracting layers to GeoJSON (ogr2ogr) =="
for layer in "${LAYERS[@]}"; do
	layer_lower=$(echo "$layer" | tr 'A-Z' 'a-z')
	out="$GEOJSON_DIR/${layer_lower}.geojson"
	rm -f "$out"

	for cell in "${CELLS[@]}"; do
		cellfile="$CONSOLIDATED_DIR/$cell/${cell}.000"

		# Missing layers are expected because not every ENC cell contains every
		# feature class. ogr2ogr exits non-zero in that case, so ignore the
		# failure. If it created an empty output file, remove it so a later cell
		# can create the GeoJSON successfully.
		ogr2ogr -f GeoJSON -update -append \
			-oo UPDATES=APPLY -oo SPLIT_MULTIPOINT=ON -oo ADD_SOUNDG_DEPTH=ON \
			"$out" "$cellfile" "$layer" || true

		[ -s "$out" ] || rm -f "$out"
	done

	count=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['features']))" "$out")
	echo "$layer: $count feature(s)"
done

# -----------------------------------------------------------------------------
# Stage 3: Build MBTiles
# -----------------------------------------------------------------------------

echo "== Building oslo-fjord.mbtiles (tippecanoe) =="

# This Tippecanoe version applies one zoom range to every input layer.
# Layer-specific visibility is therefore controlled in the MapLibre style
# using per-layer minzoom values.
tippecanoe_args=(-o "$OUTPUT_DIR/oslo-fjord.mbtiles" -f -Z6 -z16 --drop-densest-as-needed --extend-zooms-if-still-dropping)

for layer in "${LAYERS[@]}"; do
	layer_lower=$(echo "$layer" | tr 'A-Z' 'a-z')
	tippecanoe_args+=(-L "${layer_lower}:$GEOJSON_DIR/${layer_lower}.geojson")
done

tippecanoe "${tippecanoe_args[@]}"

echo "== Done: $OUTPUT_DIR/oslo-fjord.mbtiles =="