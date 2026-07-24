#!/usr/bin/env bash
#
# Loads the GeoJSON layers produced by build.sh into PostGIS.
#
# This script imports the extracted GeoJSON files from
# infra/enc-pipeline/.data/geojson/ into enc_* tables used by the backend's
# Phase 2 ENC validation endpoint (/api/missions/{id}/validate). It does not
# read or process the original S-57 ENC files.
#
# Prerequisites:
#   - Run build.sh to generate the GeoJSON layers.
#
# Required inputs:
#   /data/geojson  Read-only mount containing build.sh output.
#
# Required environment:
#   PGHOST
#   PGPORT
#   PGUSER
#   PGPASSWORD
#   PGDATABASE
set -euo pipefail

GEOJSON_DIR="/data/geojson"
PG_DSN="PG:host=$PGHOST port=$PGPORT user=$PGUSER password=$PGPASSWORD dbname=$PGDATABASE"

# Layers imported into PostGIS.
#
# These match the hazard layers checked by the Phase 1 client-side validator,
# with the addition of m_covr. Although m_covr is not a hazard layer, Phase 2
# uses it to distinguish "no hazards found" from "no ENC coverage". Keeping
# both validation phases aligned avoids inconsistent results.
LAYERS=(depare resare obstrn uwtroc lndare m_covr)

# -----------------------------------------------------------------------------
# Load GeoJSON layers into PostGIS
# -----------------------------------------------------------------------------

for layer in "${LAYERS[@]}"; do
	src="$GEOJSON_DIR/${layer}.geojson"
	table="enc_${layer}"

	if [ ! -s "$src" ]; then
		echo "$layer: no GeoJSON at $src (run build.sh first, or this cell set doesn't carry it) -- skipping"
		continue
	fi

	echo "== Loading $layer into $table =="

	ogr2ogr -f PostgreSQL "$PG_DSN" "$src" \
		-nln "$table" -overwrite -lco GEOMETRY_NAME=geom -lco SPATIAL_INDEX=GIST \
		-t_srs EPSG:4326
done

echo "== Done loading ENC hazard layers into PostGIS =="