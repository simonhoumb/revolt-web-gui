#!/usr/bin/env bash
# Loads the Phase 2 ENC hazard layers into PostGIS from the GeoJSON build.sh already extracted
# (infra/enc-pipeline/.data/geojson/*.geojson) -- run build.sh first, this doesn't touch raw S-57
# source data itself. See README.md and WebApp/CLAUDE.md's ENC validation section for how the
# resulting enc_* tables are used by the backend's /api/missions/{id}/validate endpoint.
#
# Expects:
#   /data/geojson   read-only mount of build.sh's GeoJSON output
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE   PostGIS connection (see docker-compose.yml's
#                                                     enc-postgis-ingest service)
set -euo pipefail

GEOJSON_DIR="/data/geojson"
PG_DSN="PG:host=$PGHOST port=$PGPORT user=$PGUSER password=$PGPASSWORD dbname=$PGDATABASE"

# The same five layers Phase 1's client-side check covers (encValidation.ts's HAZARD_LAYERS) --
# the two phases must never disagree about what counts as a hazard.
LAYERS=(depare resare obstrn uwtroc lndare)

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
