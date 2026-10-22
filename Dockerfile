# Build stage with shared dependencies
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS base
WORKDIR /app

# apk upgrade picks up Alpine's latest patched packages for this branch (e.g. openssl,
# expat pulled in transitively by python3) without moving off the pinned base image
# digest — the digest still fixes the OS/Node version, apk upgrade only refreshes
# point-release security fixes within it.
# better-sqlite3 bundles a prebuilt binary for this platform, so no C++
# compilation ever happens, but npm's implicit `node-gyp rebuild` still runs
# unconditionally on install (before it evaluates the prebuild and no-ops the
# actual build), and node-gyp's configure step is Python-based, so Python and
# a toolchain remain required regardless.
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache g++ make python3

COPY package*.json ./
COPY vendor/node-forge ./vendor/node-forge
RUN npm ci --ignore-scripts

# Build RAR extraction support from RARLAB's pinned UnRAR 7.23 source. Building it for the
# target platform keeps both linux/amd64 and linux/arm64 images native; the x64-only
# prebuilt archive cannot run in the ARM64 image used by Apple Silicon and Raspberry Pi.
# Version 7.23 fixes RAR recovery-volume heap overflow and archive path traversal issues.
# https://www.rarlab.com/rarnew.htm
FROM base AS unrar-builder
RUN apk add --no-cache curl

ARG RARLAB_UNRAR_SOURCE_VERSION=7.2.7
ARG RARLAB_UNRAR_SOURCE_SHA256=01d903a7dcf413cb2925696d7796e48e38d471f79bfe7ef3ad2aebf6c12dbefd
RUN set -eux; \
    curl -fsSL --proto '=https' --tlsv1.2 \
      -o /tmp/unrarsrc.tar.gz \
      "https://www.rarlab.com/rar/unrarsrc-${RARLAB_UNRAR_SOURCE_VERSION}.tar.gz"; \
    echo "${RARLAB_UNRAR_SOURCE_SHA256}  /tmp/unrarsrc.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/unrarsrc.tar.gz -C /tmp; \
    make -C /tmp/unrar -j2; \
    install -Dm755 /tmp/unrar/unrar /usr/local/bin/unrar; \
    install -Dm644 /tmp/unrar/license.txt /usr/share/licenses/questarr/UNRAR-LICENSE.txt; \
    /usr/local/bin/unrar -iver | grep -Fx '7.23'; \
    rm -rf /tmp/unrarsrc.tar.gz /tmp/unrar

# Build client and server
FROM base AS builder

COPY . .
RUN npm run build

# Production stage
FROM node:26.12.1-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS production
ARG QUESTARR_VERSION=dev

WORKDIR /app

# Set default environment variables
ENV SQLITE_DB_PATH=/app/data/sqlite.db
ENV NODE_ENV=production
ENV PORT=5000
ENV HOME=/home/questarr
ENV PUID=1000
ENV PGID=1000
ENV UMASK=022

# Install su-exec (for privilege dropping), shadow (for usermod/groupmod), 7zip (Alpine's
# own musl-native 7-Zip build for .zip/.7z/.iso/.tar/.gz/.bz2 — replaces the glibc-linked
# 7za that the npm 7zip-bin package bundles, which can never execute on this musl-only base
# image: there's no /lib64/ld-linux-x86-64.so.2 for it, so every run fails with ENOENT
# regardless of the executable bit — see ArchiveService.ts), and Python + Apprise for local
# CLI notifications. The native UnRAR binary is copied from the pinned source build below.
COPY requirements/apprise.txt /tmp/requirements-apprise.txt
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache 'libexpat>=2.9.0-r0' 7zip py3-pip python3 shadow su-exec && \
    python3 -m pip install --no-cache-dir --break-system-packages --only-binary :all: \
      --require-hashes -r /tmp/requirements-apprise.txt && \
    rm /tmp/requirements-apprise.txt

COPY --from=unrar-builder /usr/local/bin/unrar /usr/local/bin/unrar
COPY --from=unrar-builder /usr/share/licenses/questarr/UNRAR-LICENSE.txt /usr/share/licenses/questarr/UNRAR-LICENSE.txt

# Reuse node_modules from base and prune dev dependencies (avoids a second npm ci)
COPY --from=base /app/node_modules ./node_modules
COPY package*.json ./
COPY vendor/node-forge ./vendor/node-forge

# Once pruned, the base image's global npm CLI (with its own bundled node_modules, e.g.
# tar, ip-address, brace-expansion) isn't needed at runtime: CMD below execs node
# directly. Removing it drops those bundled copies from the shipped image instead of
# carrying whatever versions happened to be vendored into this Node release's npm.
RUN npm prune --omit=dev && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/lib/node_modules/corepack

# Copy necessary files from build stage
COPY --from=builder /app/dist ./dist

COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/migrations-pg ./migrations-pg
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/package.json ./

# Reuse the Alpine base image's 1000:1000 account so the default PUID/PGID
# matches the non-root runtime identity instead of allocating the next free ID.
RUN groupmod -n questarr node && \
    usermod -l questarr node && \
    mkdir -p /app/data /home/questarr && \
    chown -R questarr:questarr /app /home/questarr

# Copy and set up entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

# Run the application as the dedicated unprivileged account by default.
# Bind-mounted data directories must be owned by the configured PUID/PGID.
USER questarr:questarr
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server/index.js"]

LABEL org.opencontainers.image.title="QuestarrNG"
LABEL org.opencontainers.image.description="QuestarrNG game discovery and acquisition for SeerrNG."
LABEL org.opencontainers.image.authors="Doezer and Snapetech contributors"
LABEL org.opencontainers.image.source="https://github.com/snapetech-org/QuestarrNG"
LABEL org.opencontainers.image.licenses="GPL-3.0-only"
LABEL org.opencontainers.image.version="${QUESTARR_VERSION}"
