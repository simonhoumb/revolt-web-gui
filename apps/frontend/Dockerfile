# syntax=docker/dockerfile:1.7

# Install all workspace deps — manifests copied first for layer caching
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.node.json ./
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/frontend/vite.config.ts apps/frontend/tsconfig*.json ./apps/frontend/

# Dev stage — src/ and index.html volume-mounted by docker-compose
FROM base AS dev
WORKDIR /app/apps/frontend
ENV NODE_ENV=development
EXPOSE 5173
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# Builder stage — full production bundle, src/ added in Feature 4
FROM base AS builder
WORKDIR /app

# Prod stage — nginx serves the built static files
FROM nginx:1.27-alpine AS prod
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
