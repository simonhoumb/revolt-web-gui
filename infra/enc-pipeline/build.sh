#!/usr/bin/env bash
# Converts the Oslo Fjord DNV S-57 ENC delivery into a single vector tileset
# (oslo-fjord.mbtiles) that martin serves. Runs inside the image built from
# this directory's Dockerfile; see run.sh for the docker build/run wrapper
# and README.md for how to point it at your local ENC data.
#
# Expects:
#   /source   read-only mount of the ENC delivery root (contains one folder
#             per cell, e.g. NO4G0821/, NO5G0821/, ...)
#   /data     read-write mount for working files and the final mbtiles
set -euo pipefail

SOURCE_DIR="/source"
DATA_DIR="/data"
CONSOLIDATED_DIR="$DATA_DIR/consolidated"
GEOJSON_DIR="$DATA_DIR/geojson"
OUTPUT_DIR="$DATA_DIR/output"

# The 5 S-57 cells in the DNV delivery, covering the outer/southern Oslofjord
# around Horten, Tonsberg, Moss and Asgardstrand (not central Oslo city).
CELLS=(NO4G0821 NO4H0820 NO4H0821 NO5G0821 NO5H0820)

# S-57 layers to convert. Metadata layers (M_COVR, M_QUAL, M_NSYS, DSID) and
# land-use layers (ROADWY, RAILWY, BUAARE) are skipped as not relevant to a
# nautical chart. All layers are tiled across the same zoom range (6-16,
# below) -- this tippecanoe version has no per-file zoom override, so
# zoom-based visibility (e.g. hiding soundings/buoys until zoomed into
# harbour scale) is handled in the MapLibre style's per-layer "minzoom"
# instead of at tile-generation time.
LAYERS=(
	DEPARE DEPCNT SOUNDG COALNE LNDARE SBDARE SLCONS
	BOYLAT BOYSAW BOYSPP BOYCAR BCNLAT BCNSPP BCNISD
	LIGHTS WRECKS OBSTRN UWTROC RESARE TSSLPT TSSBND TSELNE
)

rm -rf "$CONSOLIDATED_DIR" "$GEOJSON_DIR" "$OUTPUT_DIR"
mkdir -p "$CONSOLIDATED_DIR" "$GEOJSON_DIR" "$OUTPUT_DIR"

echo "== Consolidating cell base + update files =="
for cell in "${CELLS[@]}"; do
	dest="$CONSOLIDATED_DIR/$cell"
	mkdir -p "$dest"
	# Base and update files (CELL.000, CELL.001, ...) are nested at varying
	# depths per cell in this delivery (some directly under a numbered
	# folder, some under a further ENC_ROOT/ subfolder) rather than one
	# consistent ENC_ROOT layout, so search recursively per cell.
	found=$(find "$SOURCE_DIR/$cell" -type f -iname "${cell}.0[0-9][0-9]" -exec cp {} "$dest/" \; -print | wc -l)
	echo "$cell: consolidated $found file(s)"
done

echo "== Extracting layers to GeoJSON (ogr2ogr) =="
for layer in "${LAYERS[@]}"; do
	layer_lower=$(echo "$layer" | tr 'A-Z' 'a-z')
	out="$GEOJSON_DIR/${layer_lower}.geojson"
	rm -f "$out"
	for cell in "${CELLS[@]}"; do
		cellfile="$CONSOLIDATED_DIR/$cell/${cell}.000"
		# -update -append works whether or not $out exists yet. A cell that
		# doesn't carry this layer at all makes ogr2ogr exit non-zero
		# ("Couldn't fetch requested layer") rather than writing zero
		# features -- that's expected (not every cell has every layer), so
		# tolerate it and move on to the next cell. A failed attempt still
		# leaves a zero-byte $out behind, which then blocks the next cell's
		# -update -append ("driver does not overwrite existing files") --
		# remove it so the next cell can create it fresh.
		ogr2ogr -f GeoJSON -update -append \
			-oo UPDATES=APPLY -oo SPLIT_MULTIPOINT=ON -oo ADD_SOUNDG_DEPTH=ON \
			"$out" "$cellfile" "$layer" || true
		[ -s "$out" ] || rm -f "$out"
	done
	count=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))['features']))" "$out")
	echo "$layer: $count feature(s)"
done

echo "== Building oslo-fjord.mbtiles (tippecanoe) =="
tippecanoe_args=(-o "$OUTPUT_DIR/oslo-fjord.mbtiles" -f -Z6 -z16 --drop-densest-as-needed --extend-zooms-if-still-dropping)
for layer in "${LAYERS[@]}"; do
	layer_lower=$(echo "$layer" | tr 'A-Z' 'a-z')
	tippecanoe_args+=(-L "${layer_lower}:$GEOJSON_DIR/${layer_lower}.geojson")
done
tippecanoe "${tippecanoe_args[@]}"

echo "== Done: $OUTPUT_DIR/oslo-fjord.mbtiles =="
