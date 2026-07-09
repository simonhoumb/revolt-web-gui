# ENC vector tile pipeline

Converts the DNV Oslo Fjord S-57 ENC delivery into `oslo-fjord.mbtiles`, the
vector tileset served by the `martin` service in `docker-compose.yml`
(`build.sh`), and separately loads the hazard layers into PostGIS for the
backend's Phase 2 server-side ENC validation (`ingest_postgis.sh`).

Both are one-shot batch tools, not long-running services — run them manually
whenever the source chart data changes, not as part of `docker compose up`.

## Usage

```bash
ENC_SOURCE_DIR=/path/to/DNV/delivery ./infra/enc-pipeline/run.sh
```

`ENC_SOURCE_DIR` must point at the delivery root: a folder containing one
subfolder per S-57 cell (`NO4G0821/`, `NO4H0820/`, `NO4H0821/`, `NO5G0821/`,
`NO5H0820/`). Base and update files (`CELL.000`, `CELL.001`, ...) may be
nested at different depths within each cell folder in this delivery — the
pipeline searches recursively per cell, so this doesn't need to be
normalized beforehand.

Output lands in `infra/enc-pipeline/.data/output/oslo-fjord.mbtiles`. Restart
(or `docker compose restart martin`) the `martin` service after regenerating
it so martin picks up the new file.

## Loading PostGIS (Phase 2 ENC validation)

Run `run.sh` first (it populates `infra/enc-pipeline/.data/geojson/`, which
this reuses directly — no raw S-57 access needed for this step), then:

```bash
docker compose --profile enc-ingest run --rm enc-postgis-ingest
```

Loads `depare`, `resare`, `obstrn`, `uwtroc`, `lndare` — the same five layers
Phase 1's client-side check covers (`encValidation.ts`'s `HAZARD_LAYERS`) —
into `enc_depare`/`enc_resare`/`enc_obstrn`/`enc_uwtroc`/`enc_lndare` tables
in the `db` service's Postgres, each with its own GIST index (`ogr2ogr -lco
SPATIAL_INDEX=GIST`; no Alembic migration needed, this is externally-sourced
chart data, not application schema). Column names are lowercased by Postgres
(`drval1`, not `DRVAL1` as in the GeoJSON/MapLibre feature properties) — the
backend's `/api/missions/{id}/validate` endpoint queries accordingly.
Re-running overwrites each table (`-overwrite`), so it's safe to repeat after
regenerating the source GeoJSON.

## Licensing note

The DNV delivery's `README.TXT` files are empty — redistribution terms for
this chart data are not established. **Never commit the source ENC data or
anything derived from it** (the `.data/` working directory is gitignored).
If this ever needs to ship with the repo (e.g. for CI or a demo environment
without local ENC access), confirm redistribution rights with DNV first.

## Coverage

The 5 cells cover the outer/southern Oslofjord around Horten, Tønsberg, Moss
and Åsgårdstrand — not central Oslo city. This matches DNV's own delivery
and is expected, not a bug.

## Known v1 simplification

Two of the cells are approach-scale (1:22000, `NO4*`) and three are
harbour-scale (1:8000, `NO5*`); these geographically overlap. All cells are
merged into one tileset per feature type without band-aware deduplication,
so overlapping areas may show duplicate/overlapping polygons (e.g. two
`DEPARE` shapes at slightly different resolutions covering the same patch of
water). Acceptable for a first pass. A future improvement would tag features
with a `usage_band` property during the `ogr2ogr` step and either give
tippecanoe different zoom ranges per band, or filter by zoom in the MapLibre
style (prefer harbour-scale data at zoom >= 13, approach-scale below that).

This same overlap carries into `ingest_postgis.sh`'s `enc_*` tables, since it
loads the identical per-layer GeoJSON `build.sh` already produced. Accepted
for v1 there too, for the same reason — but worth being explicit that the
Phase 2 server-side check inherits it: an `ST_Intersects`/`ST_DWithin` query
can match the coarser approach-scale polygon for a point also covered by a
more precise harbour-scale one, rather than always preferring the latter.

## Layer subset

See `build.sh`'s `LAYERS` for the exact S-57 layers converted. Metadata
layers (`M_COVR`, `M_QUAL`, `M_NSYS`, `DSID`) and land-use layers (`ROADWY`,
`RAILWY`, `BUAARE`) are skipped as not relevant to a nautical chart.

All layers are tiled across the same zoom range (6-16) — the bundled
tippecanoe version doesn't support per-file zoom overrides, so which layers
actually render at which zoom (e.g. hiding soundings/buoys until zoomed into
harbour scale) is controlled by each layer's `minzoom` in the MapLibre style
(`apps/frontend/public/map-styles/`), not at tile-generation time.
