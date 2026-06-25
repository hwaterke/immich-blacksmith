# Immich Blacksmith

_A sidecar toolkit for extending [Immich](https://immich.app)._

Blacksmith is an unofficial companion app for self-hosted Immich. It runs next
to your Immich stack and hosts curation workflows that aren't (yet) in the main
app — reading from Immich's database for fast browsing and pushing changes back
through the official REST API.

> **Status:** v0 — useful but small. The current toolset is intentionally
> minimal; more tools will land as the need comes up. Issues and ideas welcome.

## Features

- **Duplicate review** — compare candidate duplicate assets side-by-side and
  mark the ones to delete.
- **Nikon low-resolution review** — surface low-resolution Nikon assets (based
  on EXIF metadata) so you can re-import the originals or clean them out.

## How it works

Blacksmith connects to two surfaces of your existing Immich install:

- **Read path** — direct `SELECT` queries against Immich's PostgreSQL database
  via [Kysely](https://kysely.dev).
- **Write path** — every mutation (e.g. marking an asset for deletion) goes
  through Immich's official REST API using an API key, so nothing bypasses
  Immich's own logic.

No data leaves your infrastructure. Blacksmith is not affiliated with the
Immich project.

## Requirements

- A running [Immich](https://immich.app) instance
- Network access to Immich's PostgreSQL database
- An Immich API key (Account Settings → API Keys)
- Docker (recommended) or Node.js 24 for a local checkout

## Quick start — Docker Compose

A prebuilt image is published to the GitHub Container Registry for `linux/amd64`
on every push, so the easiest path is to pull it. The image is self-contained
(~150–250 MB) and runs on top of `node:24-alpine`.

### 1. Pull the image

```bash
docker pull ghcr.io/hwaterke/immich-blacksmith:latest
```

Or build it yourself from a local checkout:

```bash
docker build -t immich-blacksmith:latest .
```

The build is fully self-contained — dependencies and `pnpm build` run inside
the builder stage, so no local `node_modules` or `.output` is required.

### 2. Add a service to your Immich `docker-compose.yml`

Drop this next to the existing `immich-server`, `database`, `redis`… services:

```yaml
immich-blacksmith:
  container_name: immich_blacksmith
  image: ghcr.io/hwaterke/immich-blacksmith:latest
  # Or build from a local checkout instead of pulling the image:
  # build: ./immich-blacksmith
  environment:
    DB_HOST: database
    DB_PORT: 5432
    DB_NAME: ${DB_DATABASE_NAME}
    DB_USER: ${DB_USERNAME}
    DB_PASSWORD: ${DB_PASSWORD}
    IMMICH_URL: http://immich-server:2283/api
    IMMICH_API_KEY: ${IMMICH_API_KEY}
    # Optional — only needed if the media is mounted at a different path than
    # Immich's. Leave unset when mounting at the identical path (see below).
    # MEDIA_PATH_SOURCE: /usr/src/app/upload
    # MEDIA_PATH_TARGET: /media
  volumes:
    # Mount the same media Immich sees so Blacksmith can run exiftool on it.
    # Easiest: mount it at the identical path Immich uses (no translation needed).
    - ${UPLOAD_LOCATION}:/usr/src/app/upload:ro
  ports:
    - 3001:3000
  depends_on:
    - database
    - immich-server
  restart: always
```

Notes:

- `DB_DATABASE_NAME`, `DB_USERNAME`, `DB_PASSWORD` are already in Immich's
  `.env`. Reuse them as-is.
- `IMMICH_API_KEY` must be generated in Immich and added to the same `.env`.
- The EXIF panel runs `exiftool` directly on the image files, so the media must
  be mounted into this container. Mount it at the **same path** Immich uses
  (matching `asset.originalPath`) and no translation is needed. Otherwise, before
  running exiftool Blacksmith strips `MEDIA_PATH_SOURCE` (if set) from the path
  and prepends `MEDIA_PATH_TARGET`: leave `MEDIA_PATH_SOURCE` blank and set
  `MEDIA_PATH_TARGET` to prepend a mount base (e.g. `/Volumes`), or set both to
  swap one prefix for another. A read-only (`:ro`) mount is sufficient.
- Reviewing similar assets across **all** users works because metadata is read
  from the database, and thumbnails the single API key can't fetch (other users'
  assets) are served from Immich's pre-generated thumbnail files on disk. With
  the `${UPLOAD_LOCATION}:/usr/src/app/upload:ro` mount above this works out of
  the box. If you mount the upload dir elsewhere, set `IMMICH_UPLOAD_PATH_SOURCE`
  / `IMMICH_UPLOAD_PATH_TARGET` the same way as `MEDIA_PATH_*`.
- The service joins Immich's default network, so it reaches `database` and
  `immich-server` by service name — no extra `networks:` entry needed.
- Host port `3001` avoids clashing with Immich's web UI on `2283`. Change it
  to whatever you prefer.

### 3. Start it

```bash
docker compose up -d immich-blacksmith
```

Then browse `http://<host>:3001`.

## Configuration

All configuration is via environment variables.

| Variable                    | Description                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMMICH_URL`                | Base URL of Immich's REST API, e.g. `http://immich-server:2283/api`.                                                                                                             |
| `IMMICH_API_KEY`            | API key generated in Immich (Account Settings → API Keys).                                                                                                                       |
| `DB_HOST`                   | Hostname of Immich's PostgreSQL server.                                                                                                                                          |
| `DB_PORT`                   | PostgreSQL port (default `5432`).                                                                                                                                                |
| `DB_NAME`                   | Immich database name.                                                                                                                                                            |
| `DB_USER`                   | PostgreSQL user. A read-only role is supported and recommended (see below).                                                                                                      |
| `DB_PASSWORD`               | PostgreSQL password for the user above.                                                                                                                                          |
| `MEDIA_PATH_SOURCE`         | Optional. Path prefix stored by Immich (`asset.originalPath`) to strip before exiftool runs. Leave blank to keep the whole path.                                                 |
| `MEDIA_PATH_TARGET`         | Optional. Path prefix prepended after stripping `MEDIA_PATH_SOURCE` (e.g. `/Volumes`). Leave both blank if media is mounted at the identical path.                               |
| `IMMICH_UPLOAD_PATH_SOURCE` | Optional. Immich-side prefix of the upload dir (where generated thumbnails live, e.g. `/usr/src/app/upload`) to strip when serving thumbnails for other users' assets from disk. |
| `IMMICH_UPLOAD_PATH_TARGET` | Optional. Where Immich's upload dir is mounted in Blacksmith. Leave both blank when mounted at the identical path.                                                               |

See [`.env.example`](.env.example) for a template.

## Optional: dedicated read-only PostgreSQL user

Blacksmith only ever runs `SELECT` queries against Immich's database (all writes
go through the Immich HTTP API). If you'd rather not hand the container Immich's
full DB credentials, create a dedicated read-only role.

Open a `psql` shell inside the Immich database container:

```bash
docker exec -it immich_postgres psql -U <immich_user> -d <immich_db>
```

Then run, once:

```sql
CREATE USER immich_readonly WITH PASSWORD 'choose-a-password';
GRANT CONNECT ON DATABASE immich TO immich_readonly;
GRANT USAGE ON SCHEMA public TO immich_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO immich_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO immich_readonly;
```

Then point the compose service at the new credentials:

```yaml
DB_USER: immich_readonly
DB_PASSWORD: choose-a-password
```

Write workflows (e.g. marking duplicates for deletion) keep working because
they go through Immich's REST API, not direct SQL.

## Local development

Blacksmith is a [TanStack Start](https://tanstack.com/start) app using
[Nitro](https://nitro.build) for the server runtime. It uses `pnpm`.

```bash
pnpm install
cp .env.example .env       # then fill in your values
pnpm dev                    # http://localhost:3000
```

Other scripts:

```bash
pnpm build                  # production bundle into .output/
pnpm lint                   # eslint
pnpm check                  # prettier --check
pnpm format                 # prettier --write
pnpm test                   # vitest
```

If your Immich schema is newer than the bundled type definitions, regenerate
them:

```bash
pnpm db:introspect
```

## License

[MIT](LICENSE).

## Acknowledgements

Blacksmith only exists because [Immich](https://immich.app) is a great
self-hosted photo platform. Huge thanks to the
[Immich team and contributors](https://github.com/immich-app/immich).
This project is independent of and not endorsed by the Immich project.
