# syntax=docker/dockerfile:1

# ---- Stage 1: build the Vite SPA with pnpm ---------------------------------
FROM node:22-slim AS build

ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app

# Install deps first (cached until the lockfile changes)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the rest and build. VITE_* vars are baked at build time — pass with
#   docker build --build-arg VITE_API_BASE_URL=https://api.example.com ...
ARG VITE_API_BASE_URL
ARG VITE_API_PORT
COPY . .
RUN pnpm run build-only

# ---- Stage 2: serve the static build with nginx ----------------------------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Regenera /env.js en cada arranque con las env del pod (K8s Secret/ConfigMap).
# El entrypoint oficial de nginx ejecuta /docker-entrypoint.d/*.sh antes del CMD.
COPY docker/40-generate-env-js.sh /docker-entrypoint.d/40-generate-env-js.sh
RUN chmod +x /docker-entrypoint.d/40-generate-env-js.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
