# Build a small Alpine helper whose only elevated operation is correcting ownership
# inside Home Assistant's writable /data mount.
ARG QUESTARR_IMAGE=ghcr.io/snapetech/questarrng:1.10.0@sha256:508cbf42d5d1cbb1dcf0fbab71c2a2caa6fe6af36ef541cbf4d44066d97b288d
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS data-owner-builder
RUN apk add --no-cache build-base
COPY fix-data-owner.c /tmp/fix-data-owner.c
RUN cc -Os -Wall -Wextra -Werror -static -o /questarr-fix-data-owner /tmp/fix-data-owner.c

FROM ${QUESTARR_IMAGE}
USER root
ARG BUILD_ARCH=amd64
ARG QUESTARR_VERSION=1.10.0

LABEL \
    io.hass.name="Questarr" \
    io.hass.description="Arr-inspired game management with discovery, tracking, and automated downloads." \
    io.hass.arch="${BUILD_ARCH}" \
    io.hass.type="addon" \
    io.hass.version="${QUESTARR_VERSION}"

RUN mkdir -p /data

# If the base image has seeded /app/data content, migrate it once to persistent storage.
RUN if [ -d /app/data ] && [ ! -L /app/data ]; then cp -a /app/data/. /data/ && rm -rf /app/data; fi

RUN ln -sfn /data /app/data

COPY ha-entrypoint.sh /ha-entrypoint.sh
COPY --from=data-owner-builder /questarr-fix-data-owner /usr/local/bin/questarr-fix-data-owner
RUN chmod +x /ha-entrypoint.sh && \
    apk add --no-cache libcap-utils && \
    setcap cap_chown+ep /usr/local/bin/questarr-fix-data-owner && \
    test "$(getcap /usr/local/bin/questarr-fix-data-owner)" = \
      "/usr/local/bin/questarr-fix-data-owner cap_chown=ep" && \
    apk del libcap-utils

USER questarr:questarr
ENTRYPOINT ["/ha-entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
