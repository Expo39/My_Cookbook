FROM node:24.21.0-bookworm-slim AS node

FROM rust:1.98.1-bookworm AS build

ARG WASM_BINDGEN_VERSION=0.2.129
ARG BINARYEN_VERSION=128
ARG PNPM_VERSION=10.34.6

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
 && rustup target add wasm32-unknown-unknown \
 && curl -fsSL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WASM_BINDGEN_VERSION}/wasm-bindgen-${WASM_BINDGEN_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin "wasm-bindgen-${WASM_BINDGEN_VERSION}-x86_64-unknown-linux-musl/wasm-bindgen" \
 && curl -fsSL "https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-x86_64-linux.tar.gz" \
    | tar -xz --strip-components=2 -C /usr/local/bin "binaryen-version_${BINARYEN_VERSION}/bin/wasm-opt" \
 && corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /src
COPY . .

RUN cargo build --release --locked -p cookbook-server -p cookbook-cli
RUN sh scripts/build-wasm.sh \
 && target/release/cookbook-cli build --out web/static/data
RUN pnpm --dir web install --frozen-lockfile \
 && PUBLIC_BACKEND=server BASE_PATH="" pnpm --dir web build

FROM debian:bookworm-slim

ARG HOST_UID=1000
ARG HOST_GID=1000

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory /data \
 && groupadd --gid "${HOST_GID}" cookbook \
 && useradd --uid "${HOST_UID}" --gid "${HOST_GID}" --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin cookbook \
 && mkdir -p /data/recipes \
 && chown -R cookbook:cookbook /data

COPY --from=build /src/target/release/cookbook-server /usr/local/bin/cookbook-server
COPY --from=build /src/web/build /srv/web

ENV COOKBOOK_ROOT=/data \
    WEB_DIR=/srv/web \
    BIND=0.0.0.0:8080 \
    HOME=/tmp

USER cookbook
WORKDIR /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD ["cookbook-server", "--healthcheck"]
ENTRYPOINT ["cookbook-server"]
