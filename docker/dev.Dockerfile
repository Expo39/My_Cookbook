FROM node:24.21.0-bookworm-slim AS node

FROM rust:1.98.1-bookworm

ARG HOST_UID=1000
ARG HOST_GID=1000
ARG NEXTEST_VERSION=0.9.148
ARG WASM_BINDGEN_VERSION=0.2.129
ARG PNPM_VERSION=10.34.6
ARG PLAYWRIGHT_VERSION=1.64.0

COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && ln -s ../lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack

RUN rustup target add wasm32-unknown-unknown \
 && rustup component add clippy rustfmt

RUN curl -fsSL "https://github.com/nextest-rs/nextest/releases/download/cargo-nextest-${NEXTEST_VERSION}/cargo-nextest-${NEXTEST_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
    | tar -xz -C /usr/local/bin \
 && curl -fsSL "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WASM_BINDGEN_VERSION}/wasm-bindgen-${WASM_BINDGEN_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin "wasm-bindgen-${WASM_BINDGEN_VERSION}-x86_64-unknown-linux-musl/wasm-bindgen"

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npm install --global "playwright@${PLAYWRIGHT_VERSION}" \
 && playwright install --with-deps chromium webkit \
 && npm uninstall --global playwright \
 && rm -rf /var/lib/apt/lists/* /root/.npm

RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
 && mkdir -p /opt/corepack && cp -r /root/.cache/node/corepack/. /opt/corepack/

RUN groupadd --gid "${HOST_GID}" dev \
 && useradd --uid "${HOST_UID}" --gid "${HOST_GID}" --create-home --shell /bin/bash dev \
 && mkdir -p /home/dev/.cargo/registry /home/dev/.cargo/git /home/dev/.local/share/pnpm /work/target /work/web/node_modules \
 && chown -R dev:dev /home/dev /work

ENV CARGO_HOME=/home/dev/.cargo \
    COREPACK_HOME=/opt/corepack \
    PNPM_HOME=/home/dev/.local/share/pnpm \
    CARGO_TARGET_DIR=/work/target \
    PATH=/usr/local/cargo/bin:/home/dev/.cargo/bin:$PATH

USER dev
WORKDIR /work
