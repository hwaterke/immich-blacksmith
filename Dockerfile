# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

# Install the latest ExifTool from exiftool.org (it is a Perl program, so perl
# is required at runtime; make is only needed to install and is removed after).
RUN apk add --no-cache perl make \
  && VERSION="$(wget -qO- https://exiftool.org/ver.txt)" \
  && wget -qO /tmp/exiftool.tar.gz "https://exiftool.org/Image-ExifTool-${VERSION}.tar.gz" \
  && mkdir -p /tmp/exiftool \
  && tar xzf /tmp/exiftool.tar.gz -C /tmp/exiftool --strip-components=1 \
  && cd /tmp/exiftool \
  && perl Makefile.PL \
  && make install \
  && cd / \
  && rm -rf /tmp/exiftool /tmp/exiftool.tar.gz \
  && apk del make \
  && exiftool -ver

COPY --from=builder --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
