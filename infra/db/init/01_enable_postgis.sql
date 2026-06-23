-- Runs automatically on first container start via docker-entrypoint-initdb.d
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
