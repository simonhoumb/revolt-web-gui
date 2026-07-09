# Tippecanoe has no official image with GDAL built in, and GDAL's image has no
# Tippecanoe package available, so the tippecanoe/tile-join binaries are lifted
# out of klokantech/tippecanoe and dropped onto the GDAL image we already match
# in version with the host (see WebApp/CLAUDE.md). Both binaries only need
# libsqlite3 and zlib at runtime, which the GDAL image already ships.
FROM klokantech/tippecanoe:latest AS tippecanoe

FROM ghcr.io/osgeo/gdal:ubuntu-small-3.8.4

COPY --from=tippecanoe /usr/local/bin/tippecanoe /usr/local/bin/tippecanoe
COPY --from=tippecanoe /usr/local/bin/tile-join /usr/local/bin/tile-join

WORKDIR /pipeline
COPY build.sh ingest_postgis.sh ./
RUN chmod +x build.sh ingest_postgis.sh

# ingest_postgis.sh (Phase 2 ENC validation) overrides this via docker-compose.yml's
# enc-postgis-ingest service entrypoint -- build.sh stays the default for run.sh's direct
# docker run usage.
ENTRYPOINT ["./build.sh"]
