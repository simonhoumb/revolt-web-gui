# ENC vector tile pipeline

Converts the DNV Oslo Fjord S-57 ENC delivery into `oslo-fjord.mbtiles`, the
vector tileset served by the `martin` service in `docker-compose.yml`.

This is a one-shot batch tool, not a long-running service — run it manually
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

## Layer subset

See `build.sh`'s `LAYERS` for the exact S-57 layers converted. Metadata
layers (`M_COVR`, `M_QUAL`, `M_NSYS`, `DSID`) and land-use layers (`ROADWY`,
`RAILWY`, `BUAARE`) are skipped as not relevant to a nautical chart.

All layers are tiled across the same zoom range (6-16) — the bundled
tippecanoe version doesn't support per-file zoom overrides, so which layers
actually render at which zoom (e.g. hiding soundings/buoys until zoomed into
harbour scale) is controlled by each layer's `minzoom` in the MapLibre style
(`apps/frontend/public/map-styles/`), not at tile-generation time.
